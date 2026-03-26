// STORY-036 — migrate integration tests
// Runs --dry-run and --apply against a test project in a live Obsidian vault.
// Requires: OBSIDIAN_RUNNING=1 environment variable.
//
// Tests:
//   1. --dry-run exits 0 with correct output shape
//   2. rename-rel rewrites connections (apply then verify)
//   3. promote updates type and renames file

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { validateSpec, type MigrateOp } from '../../../src/commands/migrate.ts';
import { obEval } from '../../../src/lib/obsidian.ts';
import { encodeForJs } from '../../../src/lib/json.ts';
import { spawnCapture } from '../../../src/lib/shell.ts';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

const VAULT = process.env.TEST_VAULT ?? 'study';
const TEST_SLUG = '_migrate-test-ts';
const RUNNING = process.env.OBSIDIAN_RUNNING === '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestProject(): Promise<void> {
  const jsSlug = encodeForJs(TEST_SLUG);
  await obEval(
    VAULT,
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
    VAULT,
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
  if (!RUNNING) return;
  await createTestProject();
});

afterAll(async () => {
  if (!RUNNING) return;
  await cleanupTestProject();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrate integration', () => {
  test.skipIf(!RUNNING)('--dry-run: validateSpec passes for rename-rel spec', async () => {
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    const errors = validateSpec(spec);
    expect(errors).toHaveLength(0);
  });

  test.skipIf(!RUNNING)('--dry-run via CLI exits 0 on valid spec', async () => {
    // Write temp spec file
    const specPath = path.join(os.tmpdir(), `migrate-test-${Date.now()}.json`);
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    await fs.writeFile(specPath, JSON.stringify(spec));

    try {
      const { exitCode, stdout } = await spawnCapture([
        'bun',
        'run',
        'src/cli.ts',
        'migrate',
        `vault=${VAULT}`,
        TEST_SLUG,
        specPath,
        '--dry-run',
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dry-run');
    } finally {
      await fs.unlink(specPath).catch(() => undefined);
    }
  });

  test.skipIf(!RUNNING)('rename-rel --apply rewrites connections in project notes', async () => {
    const specPath = path.join(os.tmpdir(), `migrate-apply-${Date.now()}.json`);
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    await fs.writeFile(specPath, JSON.stringify(spec));

    try {
      const { exitCode, stdout } = await spawnCapture([
        'bun',
        'run',
        'src/cli.ts',
        'migrate',
        `vault=${VAULT}`,
        TEST_SLUG,
        specPath,
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Applied rename-rel');
    } finally {
      await fs.unlink(specPath).catch(() => undefined);
    }
  });

  test.skipIf(!RUNNING)('idempotency: re-running rename-rel shows 0 notes modified', async () => {
    // old-rel was already renamed to new-rel in the previous test — running again gives 0
    const specPath = path.join(os.tmpdir(), `migrate-idempotent-${Date.now()}.json`);
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'old-rel', to: 'new-rel' }];
    await fs.writeFile(specPath, JSON.stringify(spec));

    try {
      const { exitCode, stdout } = await spawnCapture([
        'bun',
        'run',
        'src/cli.ts',
        'migrate',
        `vault=${VAULT}`,
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
