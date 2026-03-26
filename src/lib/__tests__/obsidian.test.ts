import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock shell.ts before importing obsidian.ts so spawnCapture is intercepted.
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

mock.module('../shell.ts', () => ({
  spawnCapture: mockSpawnCapture,
  ShellTimeoutError: class ShellTimeoutError extends Error {},
}));

// Import AFTER mock.module() is in place
const { resolveVault, obEval } = await import('../obsidian.ts');

describe('resolveVault', () => {
  beforeEach(() => {
    mockSpawnCapture.mockReset();
  });

  test('returns name directly from vault= prefix', async () => {
    const name = await resolveVault('vault=study');
    expect(name).toBe('study');
    // No subprocess needed for vault= form
    expect(mockSpawnCapture).not.toHaveBeenCalled();
  });

  test('returns bare string arg as-is', async () => {
    const name = await resolveVault('my-vault');
    expect(name).toBe('my-vault');
    expect(mockSpawnCapture).not.toHaveBeenCalled();
  });

  test('falls back to obsidian vault command when arg is undefined', async () => {
    mockSpawnCapture.mockImplementation(async () => ({
      stdout: 'name\tstudy\npath\t/Users/me/study\n',
      stderr: '',
      exitCode: 0,
    }));

    const name = await resolveVault(undefined);
    expect(name).toBe('study');
    expect(mockSpawnCapture).toHaveBeenCalledWith(['obsidian', 'vault']);
  });

  test('falls back to obsidian vault command when arg is empty string', async () => {
    mockSpawnCapture.mockImplementation(async () => ({
      stdout: 'name\tdev-vault\n',
      stderr: '',
      exitCode: 0,
    }));

    const name = await resolveVault('');
    expect(name).toBe('dev-vault');
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
