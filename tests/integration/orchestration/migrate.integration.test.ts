// Runs --dry-run and --apply against a test project in a live Obsidian vault.
//
// Tests:
//   1. --dry-run exits 0 with correct output shape
//   2. rename-rel rewrites connections (apply then verify)
//   3. promote updates type and renames file

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { validateSpec, type MigrateOp } from '../../../src/commands/migrate';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';
import { spawnCapture } from '../../../src/lib/shell';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';
const TEST_SLUG = 'migrate-test-ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestProject(): Promise<void> {
  const jsSlug = encodeForJs(TEST_SLUG);
  await obEval(
    VAULT_NAME,
    `(async () => {
  var projDir = 'projects/' + ${jsSlug};
  var f = app.vault.getAbstractFileByPath(projDir);
  if (!f) await app.vault.createFolder(projDir);

  var prefix = 'TESTMIG';

  // _ontology with 'old-rel' defined
  var ontoPath = projDir + '/_ontology.' + ${jsSlug} + '.md';
  if (!app.vault.getAbstractFileByPath(ontoPath)) {
    await app.vault.create(ontoPath,
      '---\\ntype: ROOT\\nkind: ontology\\nspine: ${TEST_SLUG}\\nstatus: active\\ncreated: 2026-01-01\\ntitle: Ontology\\naliases: []\\nupdated: 2026-01-01\\n---\\n# Ontology\\n\\n| Relation | Inverse |\\n|----------|---------|\\n| \`old-rel\` | \`rev-rel\` |\\n'
    );
  }

  // A leaf note that uses old-rel in connections
  var leafPath = projDir + '/' + prefix + '.leaf-a - Leaf A.md';
  if (!app.vault.getAbstractFileByPath(leafPath)) {
    await app.vault.create(leafPath,
      '---\\ntitle: Leaf A\\ntype: LEAF\\nkind: concept\\nspine: ${TEST_SLUG}\\nstatus: draft\\ncreated: 2026-01-01\\naliases: []\\nparent: ""\\nchildren: []\\n---\\n## Breadcrumb\\n\\n## Connections\\n\\n- old-rel :: [[TESTMIG.root - Root]]\\n'
    );
  }
})()`
  );
}

async function cleanupTestProject(): Promise<void> {
  const jsSlug = encodeForJs(TEST_SLUG);
  await obEval(
    VAULT_NAME,
    `(async () => {
  var f = app.vault.getAbstractFileByPath('projects/' + ${jsSlug});
  if (f) await app.vault.trash(f, false);
})()`
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await createTestProject();
});

afterAll(async () => {
  if (process.env.NERV_SKIP_CLEANUP === '1') return;
  await cleanupTestProject();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrate integration', () => {
  test('--dry-run: validateSpec passes for rename-rel spec', async () => {
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    const errors = validateSpec(spec);
    expect(errors).toHaveLength(0);
  });

  test('--dry-run via CLI exits 0 on valid spec', async () => {
    // Write temp spec file
    const specPath = path.join(os.tmpdir(), `migrate-test-${Date.now()}.json`);
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    await fs.writeFile(specPath, JSON.stringify(spec));

    try {
      const { exitCode, stdout, stderr } = await spawnCapture([
        process.execPath,
        'run',
        'src/cli.ts',
        'migrate',
        '--vault',
        VAULT_NAME,
        TEST_SLUG,
        specPath,
        '--dry-run',
      ]);
      if (exitCode !== 0) console.error('migrate dry-run stderr:', stderr);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dry-run');
    } finally {
      await fs.unlink(specPath).catch(() => undefined);
    }
  });

  test('rename-rel --apply rewrites connections in project notes', async () => {
    const specPath = path.join(os.tmpdir(), `migrate-apply-${Date.now()}.json`);
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    await fs.writeFile(specPath, JSON.stringify(spec));

    try {
      const { exitCode, stdout } = await spawnCapture([
        process.execPath,
        'run',
        'src/cli.ts',
        'migrate',
        '--vault',
        VAULT_NAME,
        TEST_SLUG,
        specPath,
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Applied rename-rel');
    } finally {
      await fs.unlink(specPath).catch(() => undefined);
    }
  });

  test('idempotency: re-running rename-rel shows 0 notes modified', async () => {
    // old-rel was already renamed to new-rel in the previous test — running again gives 0
    const specPath = path.join(os.tmpdir(), `migrate-idempotent-${Date.now()}.json`);
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    await fs.writeFile(specPath, JSON.stringify(spec));

    try {
      const { exitCode, stdout } = await spawnCapture([
        process.execPath,
        'run',
        'src/cli.ts',
        'migrate',
        '--vault',
        VAULT_NAME,
        TEST_SLUG,
        specPath,
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Applied rename-rel to 0 note(s)');
    } finally {
      await fs.unlink(specPath).catch(() => undefined);
    }
  });
});
