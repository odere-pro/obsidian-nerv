//
// E2E integration test for init-vault.
// Creates a real vault at ./docs/vaults using the default path convention.
// Does NOT require Obsidian to be running — filesystem assertions only.
//
// Run: bun test tests/integration/motor/init-vault.integration.test.ts

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { VAULT_DIRS, buildVaultFileMap, initVault } from '../../../src/commands/init-vault';

const VAULT_NAME = Bun.env.NERV_TEST_VAULT ?? 'e2e-integration-test-vault';
const VAULT_PATH = resolve(Bun.env.NERV_VAULT_PATH ?? './docs/vaults');

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await Bun.$`mkdir -p ${VAULT_PATH}`.quiet();
});

afterAll(async () => {
  await Bun.$`rm -rf ${VAULT_PATH}`.quiet();
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('init-vault e2e', () => {
  test('provisions vault without throwing', async () => {
    const result = await initVault({ name: VAULT_NAME, path: VAULT_PATH });
    expect(result).toBeDefined();
    expect(result.created.length).toBeGreaterThan(0);
  });

  test('creates all required vault directories', async () => {
    for (const dir of VAULT_DIRS) {
      const full = join(VAULT_PATH, dir);
      expect((await Bun.$`test -d ${full}`.quiet().nothrow()).exitCode).toBe(0);
    }
  });

  test('creates all 10 .obsidian config files', async () => {
    const keys = Object.keys(buildVaultFileMap()).filter(k => k.startsWith('.obsidian/'));
    for (const relPath of keys) {
      expect(await Bun.file(join(VAULT_PATH, relPath)).exists()).toBe(true);
    }
  });

  test('creates all 9 template files', async () => {
    const keys = Object.keys(buildVaultFileMap()).filter(k => k.startsWith('_templates/'));
    for (const relPath of keys) {
      expect(await Bun.file(join(VAULT_PATH, relPath)).exists()).toBe(true);
    }
  });

  test('creates all 3 audit base files', async () => {
    expect(await Bun.file(join(VAULT_PATH, '_bases/audit-missing-properties.base')).exists()).toBe(
      true
    );
    expect(await Bun.file(join(VAULT_PATH, '_bases/audit-drafts.base')).exists()).toBe(true);
    expect(await Bun.file(join(VAULT_PATH, '_bases/audit-orphans.base')).exists()).toBe(true);
  });

  test('app.json is valid JSON with correct settings', async () => {
    const raw = await Bun.file(join(VAULT_PATH, '.obsidian/app.json')).text();
    const app = JSON.parse(raw);
    expect(app.newFileFolderPath).toBe('_inbox');
    expect(app.useMarkdownLinks).toBe(false);
  });

  test('creates .gitignore with expected entries', async () => {
    const gi = await Bun.file(join(VAULT_PATH, '.gitignore')).text();
    expect(gi).toContain('.obsidian/workspace.json');
    expect(gi).toContain('.DS_Store');
  });

  test('is idempotent — second run skips all existing files', async () => {
    const second = await initVault({ name: VAULT_NAME, path: VAULT_PATH });
    const nonGit = second.created.filter(f => !f.endsWith('.gitignore'));
    expect(nonGit).toHaveLength(0);
    expect(second.skipped.some(f => f.endsWith('app.json'))).toBe(true);
  });
});
