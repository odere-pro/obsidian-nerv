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

mock.module('../../../src/lib/shell', () => {
  class ShellTimeoutError extends Error {
    name = 'ShellTimeoutError';
  }

  async function retrySpawn(
    cmd: [string, ...string[]],
    opts: { maxAttempts?: number; baseDelayMs?: number; timeoutMs?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const maxAttempts = opts.maxAttempts ?? 3;
    const baseDelayMs = opts.baseDelayMs ?? 500;
    let lastResult: { stdout: string; stderr: string; exitCode: number } | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await mockSpawnCapture(cmd);
        if (result.exitCode === 0) return result;
        lastResult = result;
        return result;
      } catch (err) {
        lastError = err;
      }
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    if (lastResult) return lastResult;
    throw lastError;
  }

  return {
    spawnCapture: mockSpawnCapture,
    retrySpawn,
    ShellTimeoutError,
  };
});

// Import vault-registry so we can mock it for resolveVault tests
import * as vaultRegistry from '../../../src/lib/vault-registry';

// Import AFTER mock.module() is in place
const { resolveVault, obEval } = await import('../../../src/lib/obsidian');

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
    const vaultPath = join(testDir, 'my-vault');
    await mkdir(vaultPath, { recursive: true });
    await vaultRegistry.registerVault(vaultPath);
    const name = await resolveVault('my-vault');
    expect(name).toBe('my-vault');
  });

  test('resolveVault(name) with vault not in registry → throws NotFoundError', async () => {
    try {
      await resolveVault('missing');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('missing');
    }
  });

  test('resolveVault(name) with vault registered but path missing from disk → throws with path', async () => {
    const missingPath = join(testDir, 'phantom');
    const registryFile = join(testDir, 'vaults.json');
    await Bun.write(
      registryFile,
      JSON.stringify({ vaults: [{ path: missingPath, isDefault: true }] })
    );

    try {
      await resolveVault('phantom');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toContain('phantom');
      expect(msg).toContain(missingPath);
      expect(msg).toContain('does not exist');
    }
  });

  test('resolveVault(undefined) with NERV_DEFAULT_VAULT set and vault registered → returns name', async () => {
    const vaultPath = join(testDir, 'my-vault');
    await mkdir(vaultPath, { recursive: true });
    await vaultRegistry.registerVault(vaultPath);
    process.env['NERV_DEFAULT_VAULT'] = 'my-vault';
    const name = await resolveVault(undefined);
    expect(name).toBe('my-vault');
  });

  test('resolveVault(undefined) with no env and registry default set → returns default vault name', async () => {
    const vaultPath = join(testDir, 'default-vault');
    await mkdir(vaultPath, { recursive: true });
    await vaultRegistry.registerVault(vaultPath);
    // First vault gets isDefault: true automatically
    const name = await resolveVault(undefined);
    expect(name).toBe('default-vault');
  });

  test('resolveVault(undefined) with no env and no registry default → throws with actionable message', async () => {
    try {
      await resolveVault(undefined);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toContain('No vault specified');
      expect(msg).toContain('--vault');
      expect(msg).toContain('NERV_DEFAULT_VAULT');
    }
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

    expect(mockSpawnCapture).toHaveBeenCalledWith(['obsidian', 'vault=study', 'eval', 'code=1+1']);
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

  test('large expressions use temp file with bootstrap wrapper', async () => {
    mockSpawnCapture.mockImplementation(async () => ({
      stdout: '=> ok\n',
      stderr: '',
      exitCode: 0,
    }));

    // Create an expression that exceeds MAX_INLINE_EXPR (4000 chars)
    const largeExpr = 'x'.repeat(5000);
    await obEval('study', largeExpr);

    // The code= arg should be a short bootstrap that reads a temp file,
    // not the full 5000-char expression
    const callArgs = mockSpawnCapture.mock.calls[0][0] as string[];
    const codeArg = callArgs[3];
    expect(codeArg.length).toBeLessThan(200);
    expect(codeArg).toContain("require('fs').readFileSync");
    expect(codeArg).toContain('obeval-');
  });
});
