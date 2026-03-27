import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as registry from '../vault-registry';

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
    await registry.registerVault('main', testDir);
    const r = await registry.readRegistry();
    expect(r.vaults).toHaveLength(1);
    expect(r.vaults[0]!.name).toBe('main');
  });

  test('is idempotent — same name + same path → no-op, no error', async () => {
    await registry.registerVault('main', testDir);
    await registry.registerVault('main', testDir); // second call, same args
    const r = await registry.readRegistry();
    expect(r.vaults).toHaveLength(1);
  });

  test('sets isDefault: true on the first vault registered', async () => {
    await registry.registerVault('first', testDir);
    const r = await registry.readRegistry();
    expect(r.vaults[0]!.isDefault).toBe(true);
  });

  test('rejects a path outside the git root with a descriptive error message', async () => {
    // Restore the real registryPath so findGitRoot path-check can run
    mock.restore();
    delete process.env['NERV_SKIP_GIT_ROOT_CHECK'];

    // Override findGitRoot to return a known fake root inside the tmp dir
    const fakeGitRoot = join(testDir, 'repo');
    await mkdir(fakeGitRoot, { recursive: true });
    spyOn(registry, 'findGitRoot').mockImplementation(async () => fakeGitRoot);
    // Also re-mock registry path to use our test dir
    spyOn(registry, 'registryPath').mockImplementation(async () => join(testDir, 'vaults.json'));

    // outsidePath is sibling of fakeGitRoot — definitely outside it
    const outsidePath = join(testDir, 'outside-vault');
    await mkdir(outsidePath, { recursive: true });

    const logErrorMock = spyOn(process.stderr, 'write').mockImplementation(() => true);
    let exited = false;
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      exited = true;
      throw new Error('process.exit called');
    });

    try {
      await registry.registerVault('outside', outsidePath);
    } catch {
      // expected
    }

    expect(exited).toBe(true);
    const writtenMsg = (logErrorMock.mock.calls[0]?.[0] as string) ?? '';
    expect(writtenMsg).toContain('path must be inside the git repository');
    expect(writtenMsg).toContain(outsidePath);

    exitSpy.mockRestore();
    logErrorMock.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// lookupVault
// ---------------------------------------------------------------------------

describe('lookupVault', () => {
  test('returns the correct entry', async () => {
    await registry.registerVault('alpha', testDir);
    const entry = await registry.lookupVault('alpha');
    expect(entry.name).toBe('alpha');
  });

  test('throws with an actionable message for an unregistered name', async () => {
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await registry.lookupVault('ghost');
    } catch {
      // expected
    }

    const msg = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(msg).toContain('"ghost"');
    expect(msg).toContain('nerv list-vaults');

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// setDefaultVault / getDefaultVault
// ---------------------------------------------------------------------------

describe('setDefaultVault / getDefaultVault', () => {
  test('round-trip: set → read back → correct name', async () => {
    const dir2 = join(testDir, 'vault2');
    await mkdir(dir2, { recursive: true });

    await registry.registerVault('alpha', testDir);
    await registry.registerVault('beta', dir2);

    await registry.setDefaultVault('beta');
    const def = await registry.getDefaultVault();
    expect(def?.name).toBe('beta');
  });
});

// ---------------------------------------------------------------------------
// unregisterVault
// ---------------------------------------------------------------------------

describe('unregisterVault', () => {
  test('removes the entry; subsequent lookupVault throws', async () => {
    await registry.registerVault('temp', testDir);
    await registry.unregisterVault('temp');

    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await registry.lookupVault('temp');
    } catch {
      // expected
    }

    expect(stderrSpy.mock.calls.length).toBeGreaterThan(0);
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('throws descriptive error for an unknown name', async () => {
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await registry.unregisterVault('nonexistent');
    } catch {
      // expected
    }

    const msg = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(msg).toContain('"nonexistent"');
    expect(msg).toContain('not registered');

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
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

  test("['--vault'] calls logError", () => {
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      registry.extractVaultFlag(['--vault']);
    } catch {
      // expected
    }

    const msg = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(msg).toContain('--vault flag requires a value');

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
