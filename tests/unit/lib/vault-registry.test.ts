import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as registry from '../../../src/lib/vault-registry';
import { vaultName } from '../../../src/lib/vault-registry';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TMPDIR = Bun.env['TMPDIR'] ?? '/tmp';

let testDir: string;

/**
 * Override the registry path to point at a temp directory so tests never
 * touch the real `.nerv/vaults.json` in the workspace.
 */
function mockRegistryPath(dir: string): void {
  spyOn(registry, 'registryPath').mockImplementation(async () => join(dir, 'vaults.json'));
}

beforeEach(async () => {
  testDir = join(TMPDIR, `nerv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });

  // Set skip flag so registerVault never tries to shell-out to git
  process.env['NERV_SKIP_GIT_ROOT_CHECK'] = '1';

  mockRegistryPath(testDir);
});

afterEach(async () => {
  delete process.env['NERV_SKIP_GIT_ROOT_CHECK'];
  await rm(testDir, { recursive: true, force: true });
  mock.restore();
});

// ---------------------------------------------------------------------------
// registerVault
// ---------------------------------------------------------------------------

describe('registerVault', () => {
  test('adds an entry to the registry file', async () => {
    await registry.registerVault(join(testDir, 'main'));
    const r = await registry.readRegistry();
    expect(r.vaults).toHaveLength(1);
    expect(vaultName(r.vaults[0]!)).toBe('main');
  });

  test('is idempotent — same path → no-op, no error', async () => {
    await registry.registerVault(join(testDir, 'main'));
    await registry.registerVault(join(testDir, 'main')); // second call, same path
    const r = await registry.readRegistry();
    expect(r.vaults).toHaveLength(1);
  });

  test('sets isDefault: true on the first vault registered', async () => {
    await registry.registerVault(join(testDir, 'first'));
    const r = await registry.readRegistry();
    expect(r.vaults[0]!.isDefault).toBe(true);
  });

  test('rejects a path outside the git root with a descriptive error message', async () => {
    mock.restore();
    delete process.env['NERV_SKIP_GIT_ROOT_CHECK'];

    const fakeGitRoot = join(testDir, 'repo');
    await mkdir(fakeGitRoot, { recursive: true });
    spyOn(registry, 'findGitRoot').mockImplementation(async () => fakeGitRoot);
    spyOn(registry, 'registryPath').mockImplementation(async () => join(testDir, 'vaults.json'));

    const outsidePath = join(testDir, 'outside-vault');
    await mkdir(outsidePath, { recursive: true });

    try {
      await registry.registerVault(join(outsidePath, 'outside'));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toContain('path must be inside the git repository');
      expect(msg).toContain(outsidePath);
    }
  });
});

// ---------------------------------------------------------------------------
// lookupVault
// ---------------------------------------------------------------------------

describe('lookupVault', () => {
  test('returns the correct entry', async () => {
    await registry.registerVault(join(testDir, 'alpha'));
    const entry = await registry.lookupVault('alpha');
    expect(vaultName(entry)).toBe('alpha');
  });

  test('throws with an actionable message for an unregistered name', async () => {
    try {
      await registry.lookupVault('ghost');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toContain('"ghost"');
      expect(msg).toContain('nerv list-vaults');
    }
  });
});

// ---------------------------------------------------------------------------
// setDefaultVault / getDefaultVault
// ---------------------------------------------------------------------------

describe('setDefaultVault / getDefaultVault', () => {
  test('round-trip: set → read back → correct name', async () => {
    await registry.registerVault(join(testDir, 'alpha'));
    await registry.registerVault(join(testDir, 'beta'));

    await registry.setDefaultVault('beta');
    const def = await registry.getDefaultVault();
    expect(def && vaultName(def)).toBe('beta');
  });
});

// ---------------------------------------------------------------------------
// unregisterVault
// ---------------------------------------------------------------------------

describe('unregisterVault', () => {
  test('removes the entry; subsequent lookupVault throws', async () => {
    await registry.registerVault(join(testDir, 'temp'));
    await registry.unregisterVault('temp');

    expect(registry.lookupVault('temp')).rejects.toThrow();
  });

  test('throws descriptive error for an unknown name', async () => {
    try {
      await registry.unregisterVault('nonexistent');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toContain('"nonexistent"');
      expect(msg).toContain('not registered');
    }
  });
});

// ---------------------------------------------------------------------------
// extractVaultFlag
// ---------------------------------------------------------------------------

describe('extractVaultFlag', () => {
  test("['--vault', 'my-vault', 'other'] returns { vault: 'my-vault', rest: ['other'] }", () => {
    const result = registry.extractVaultFlag(['--vault', 'my-vault', 'other']);
    expect(result.vault).toBe('my-vault');
    expect(result.rest).toEqual(['other']);
  });

  test("['other'] returns { vault: undefined, rest: ['other'] }", () => {
    const result = registry.extractVaultFlag(['other']);
    expect(result.vault).toBeUndefined();
    expect(result.rest).toEqual(['other']);
  });

  test("['--vault'] throws ValidationError", () => {
    expect(() => registry.extractVaultFlag(['--vault'])).toThrow('--vault flag requires a value');
  });
});
