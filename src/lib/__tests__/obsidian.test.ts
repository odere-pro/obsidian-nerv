import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Mock shell before importing obsidian so spawnCapture is intercepted.
// ---------------------------------------------------------------------------
const mockSpawnCapture = mock(
  async (
    _cmd: [string, ...string[]]
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> => ({
    stdout: '',
    stderr: '',
    exitCode: 0,
  })
);

mock.module('../shell', () => ({
  spawnCapture: mockSpawnCapture,
  ShellTimeoutError: class ShellTimeoutError extends Error {},
}));

// Import vault-registry so we can mock it for resolveVault tests
import * as vaultRegistry from '../vault-registry';

// Import AFTER mock.module() is in place
const { resolveVault, obEval } = await import('../obsidian');

// ---------------------------------------------------------------------------
// Test helpers for resolveVault
// ---------------------------------------------------------------------------

const TMPDIR = Bun.env['TMPDIR'] ?? '/tmp';
let testDir: string;

function mockRegistryPath(dir: string): void {
  spyOn(vaultRegistry, 'registryPath').mockImplementation(async () => join(dir, 'vaults.json'));
}

describe('resolveVault', () => {
  beforeEach(async () => {
    testDir = join(TMPDIR, `nerv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    process.env['NERV_SKIP_GIT_ROOT_CHECK'] = '1';
    delete process.env['NERV_DEFAULT_VAULT'];
    mockRegistryPath(testDir);
    mockSpawnCapture.mockReset();
  });

  afterEach(async () => {
    delete process.env['NERV_SKIP_GIT_ROOT_CHECK'];
    delete process.env['NERV_DEFAULT_VAULT'];
    await rm(testDir, { recursive: true, force: true });
    mock.restore();
  });

  test('resolveVault(name) with vault registered and path on disk → returns name', async () => {
    await vaultRegistry.registerVault('my-vault', testDir);
    const name = await resolveVault('my-vault');
    expect(name).toBe('my-vault');
  });

  test('resolveVault(name) with vault not in registry → logError called', async () => {
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await resolveVault('missing');
    } catch {
      // expected
    }

    const msg = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(msg).toContain('missing');
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('resolveVault(name) with vault registered but path missing from disk → logError with path', async () => {
    const missingPath = join(testDir, 'does-not-exist');
    // Write registry entry directly with a non-existent path
    const registryFile = join(testDir, 'vaults.json');
    await Bun.write(
      registryFile,
      JSON.stringify({ vaults: [{ name: 'phantom', path: missingPath, isDefault: true }] })
    );

    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await resolveVault('phantom');
    } catch {
      // expected
    }

    const msg = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(msg).toContain('phantom');
    expect(msg).toContain(missingPath);
    expect(msg).toContain('does not exist');
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test('resolveVault(undefined) with NERV_DEFAULT_VAULT set and vault registered → returns name', async () => {
    await vaultRegistry.registerVault('my-vault', testDir);
    process.env['NERV_DEFAULT_VAULT'] = 'my-vault';
    const name = await resolveVault(undefined);
    expect(name).toBe('my-vault');
  });

  test('resolveVault(undefined) with no env and registry default set → returns default vault name', async () => {
    await vaultRegistry.registerVault('default-vault', testDir);
    // First vault gets isDefault: true automatically
    const name = await resolveVault(undefined);
    expect(name).toBe('default-vault');
  });

  test('resolveVault(undefined) with no env and no registry default → logError with actionable message', async () => {
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await resolveVault(undefined);
    } catch {
      // expected
    }

    const msg = (stderrSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(msg).toContain('No vault specified');
    expect(msg).toContain('--vault');
    expect(msg).toContain('NERV_DEFAULT_VAULT');
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

describe('obEval', () => {
  beforeEach(() => {
    mockSpawnCapture.mockReset();
  });

  test('calls obsidian eval with correct vault= and code= arguments', async () => {
    mockSpawnCapture.mockImplementation(async () => ({
      stdout: '=> 2\n',
      stderr: '',
      exitCode: 0,
    }));

    await obEval('study', '1+1');

    expect(mockSpawnCapture).toHaveBeenCalledWith(['obsidian', 'eval', 'vault=study', 'code=1+1']);
  });

  test('strips the => prefix from output', async () => {
    mockSpawnCapture.mockImplementation(async () => ({
      stdout: '=> hello world\n',
      stderr: '',
      exitCode: 0,
    }));

    const result = await obEval('study', "'hello world'");
    expect(result).toBe('hello world');
  });

  test('returns multi-line output with => stripped from each line', async () => {
    mockSpawnCapture.mockImplementation(async () => ({
      stdout: '=> line1\n=> line2\n',
      stderr: '',
      exitCode: 0,
    }));

    const result = await obEval('study', "'multi'");
    expect(result).toBe('line1\nline2');
  });
});
