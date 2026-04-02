import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock vault-registry so tests don't touch the filesystem
// ---------------------------------------------------------------------------

let mockVaults: Array<{ path: string; isDefault?: boolean }> = [];

mock.module('../../../src/lib/vault-registry', () => ({
  readRegistry: async (): Promise<{ vaults: typeof mockVaults }> => ({ vaults: mockVaults }),
}));

const { default: command } = await import('../../../src/commands/list-vaults');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  try {
    await fn();
    return output;
  } finally {
    process.stdout.write = original;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('list-vaults', () => {
  beforeEach(() => {
    mockVaults = [];
  });

  afterEach(() => {
    mockVaults = [];
  });

  test('prints aligned table with default marker for populated registry', async () => {
    mockVaults = [
      { path: '/Users/me/git/project/my-vault', isDefault: true },
      { path: '/Users/me/git/project/work-vault' },
    ];

    const out = await captureStdout(() => command.run([]));

    expect(out).toContain('NAME');
    expect(out).toContain('PATH');
    expect(out).toContain('DEFAULT');
    expect(out).toContain('my-vault');
    expect(out).toContain('work-vault');
    // Default marker on correct entry
    const lines = out.split('\n').filter(Boolean);
    const myVaultLine = lines.find(l => l.includes('my-vault'));
    const workVaultLine = lines.find(l => l.includes('work-vault'));
    expect(myVaultLine).toContain('yes');
    expect(workVaultLine).not.toContain('yes');
  });

  test('--json emits parseable JSON array with both entries', async () => {
    mockVaults = [{ path: '/abs/path/my-vault', isDefault: true }, { path: '/abs/path/other' }];

    const out = await captureStdout(() => command.run(['--json']));
    const parsed = JSON.parse(out) as Array<{ name: string; path: string; isDefault: boolean }>;

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.name).toBe('my-vault');
    expect(parsed[0]?.isDefault).toBe(true);
    expect(parsed[1]?.name).toBe('other');
    expect(parsed[1]?.isDefault).toBe(false);
  });

  test('--json emits [] for empty registry', async () => {
    mockVaults = [];
    const out = await captureStdout(() => command.run(['--json']));
    expect(JSON.parse(out)).toEqual([]);
  });

  test('empty registry prints "No vaults registered" message', async () => {
    mockVaults = [];
    const out = await captureStdout(() => command.run([]));
    expect(out).toContain('No vaults registered');
    expect(out).toContain('nerv add-vault');
  });

  test('--help prints usage', async () => {
    const out = await captureStdout(() => command.run(['--help']));
    expect(out).toBe('Usage: nerv list-vaults [--json]\n');
  });
});
