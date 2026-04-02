//
// E2E integration test for add-vault.
// Creates a real vault at ./docs/vaults/<name> using the default path convention.
// Does NOT require Obsidian to be running — filesystem assertions only.
//
// Run: bun test tests/integration/motor/add-vault.integration.test.ts

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { VAULT_DIRS, buildVaultFileMap, initVault } from '../../../src/commands/add-vault';
import { registryPath } from '../../../src/lib/vault-registry';

const NERV_VAULT_PATH = process.env.NERV_VAULT_PATH ?? './docs/vaults';
const VAULT_NAME = process.env.NERV_E2E_VAULT ?? 'e2e-add-vault-test';
const DEFAULT_VAULT = `${NERV_VAULT_PATH}/${VAULT_NAME}`;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let registryBackup: string | undefined;

beforeAll(async () => {
  // Backup the vault registry before the test modifies it
  const regPath = await registryPath();
  const regFile = Bun.file(regPath);
  if (await regFile.exists()) {
    registryBackup = await regFile.text();
  }
  await Bun.$`mkdir -p ${DEFAULT_VAULT}`.quiet();
});

afterAll(async () => {
  if (process.env.NERV_SKIP_CLEANUP === '1') return;
  await Bun.$`rm -rf ${DEFAULT_VAULT}`.quiet();
  // Restore the vault registry to its original state
  if (registryBackup !== undefined) {
    const regPath = await registryPath();
    await Bun.write(regPath, registryBackup);
  }
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('add-vault e2e', () => {
  test('provisions vault without throwing', async () => {
    const result = await initVault({ name: VAULT_NAME, path: DEFAULT_VAULT });
    expect(result).toBeDefined();
    expect(result.created.length).toBeGreaterThan(0);
  }, 60_000);

  test('creates all required vault directories', async () => {
    for (const dir of VAULT_DIRS) {
      const full = join(DEFAULT_VAULT, dir);
      expect((await Bun.$`test -d ${full}`.quiet().nothrow()).exitCode).toBe(0);
    }
  });

  test('creates all 10 .obsidian config files', async () => {
    const keys = Object.keys(buildVaultFileMap()).filter(k => k.startsWith('.obsidian/'));
    for (const relPath of keys) {
      expect(await Bun.file(join(DEFAULT_VAULT, relPath)).exists()).toBe(true);
    }
  });

  test('creates all 9 template files', async () => {
    const keys = Object.keys(buildVaultFileMap()).filter(k => k.startsWith('_templates/'));
    for (const relPath of keys) {
      expect(await Bun.file(join(DEFAULT_VAULT, relPath)).exists()).toBe(true);
    }
  });

  test('creates all 3 audit base files', async () => {
    expect(
      await Bun.file(join(DEFAULT_VAULT, '_bases/audit-missing-properties.base')).exists()
    ).toBe(true);
    expect(await Bun.file(join(DEFAULT_VAULT, '_bases/audit-drafts.base')).exists()).toBe(true);
    expect(await Bun.file(join(DEFAULT_VAULT, '_bases/audit-orphans.base')).exists()).toBe(true);
  });

  test('app.json is valid JSON with correct settings', async () => {
    const raw = await Bun.file(join(DEFAULT_VAULT, '.obsidian/app.json')).text();
    const app = JSON.parse(raw);
    expect(app.newFileFolderPath).toBe('_inbox');
    expect(app.useMarkdownLinks).toBe(false);
  });

  test('creates .gitignore with expected entries', async () => {
    const gi = await Bun.file(join(DEFAULT_VAULT, '.gitignore')).text();
    expect(gi).toContain('.obsidian/workspace.json');
    expect(gi).toContain('.DS_Store');
  });

  test('is idempotent — second run skips all existing files', async () => {
    const second = await initVault({ name: VAULT_NAME, path: DEFAULT_VAULT });
    const nonGit = second.created.filter(f => !f.endsWith('.gitignore'));
    expect(nonGit).toHaveLength(0);
    expect(second.skipped.some(f => f.endsWith('app.json'))).toBe(true);
  });

  test('registers vault in .nerv/vaults.json after provisioning', async () => {
    const { registerVault, registryPath } = await import('../../../src/lib/vault-registry');
    process.env['NERV_SKIP_GIT_ROOT_CHECK'] = '1';
    await registerVault(DEFAULT_VAULT);
    delete process.env['NERV_SKIP_GIT_ROOT_CHECK'];

    const regPath = await registryPath();
    const raw = await Bun.file(regPath).text();
    const { basename } = await import('node:path');
    const registry = JSON.parse(raw) as { vaults: { path: string }[] };
    expect(registry.vaults.some(v => basename(v.path) === VAULT_NAME)).toBe(true);
  });
});
