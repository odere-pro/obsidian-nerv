import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock vault-registry
// ---------------------------------------------------------------------------

import { basename } from 'node:path';

type VaultEntry = { path: string; isDefault?: boolean };

let mockVaults: VaultEntry[] = [];

mock.module('../../../src/lib/vault-registry', () => ({
  extractVaultFlag: (args: string[]): { vault: string | undefined; rest: string[] } => {
    const idx = args.indexOf('--vault');
    if (idx === -1) return { vault: undefined, rest: args };
    const value = args[idx + 1];
    const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
    return { vault: value, rest };
  },
  readRegistry: async (): Promise<{ vaults: VaultEntry[] }> => ({ vaults: mockVaults }),
  getDefaultVault: async (): Promise<VaultEntry | undefined> =>
    mockVaults.find(v => v.isDefault === true),
  vaultName: (entry: VaultEntry): string => basename(entry.path),
}));

const { default: command } = await import('../../../src/commands/current-vault');

// ---------------------------------------------------------------------------
// Helper
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

describe('current-vault', () => {
  const originalEnv = Bun.env.NERV_DEFAULT_VAULT;

  beforeEach(() => {
    mockVaults = [];
    delete Bun.env.NERV_DEFAULT_VAULT;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      Bun.env.NERV_DEFAULT_VAULT = originalEnv;
    } else {
      delete Bun.env.NERV_DEFAULT_VAULT;
    }
    mockVaults = [];
  });

  test('reports env source when NERV_DEFAULT_VAULT is set and registered', async () => {
    mockVaults = [{ path: '/abs/env-vault' }];
    Bun.env.NERV_DEFAULT_VAULT = 'env-vault';

    const out = await captureStdout(() => command.run([]));

    expect(out).toContain('env-vault');
    expect(out).toContain('env');
    expect(out).toContain('/abs/env-vault');
  });

  test('reports default source when no env and registry default is set', async () => {
    mockVaults = [{ path: '/abs/default-vault', isDefault: true }];

    const out = await captureStdout(() => command.run([]));

    expect(out).toContain('default-vault');
    expect(out).toContain('default');
    expect(out).toContain('/abs/default-vault');
  });

  test('prints no-vault help when nothing is configured', async () => {
    mockVaults = [];

    const out = await captureStdout(() => command.run([]));

    expect(out).toContain('Current vault: (none)');
    expect(out).toContain('nerv add-vault');
    expect(out).toContain('nerv switch-vault');
    expect(out).toContain('NERV_DEFAULT_VAULT');
  });

  test('--json with registered default emits parseable JSON with correct source', async () => {
    mockVaults = [{ path: '/abs/my-vault', isDefault: true }];

    const out = await captureStdout(() => command.run(['--json']));
    const parsed = JSON.parse(out) as { vault: string; path: string; source: string };

    expect(parsed.vault).toBe('my-vault');
    expect(parsed.path).toBe('/abs/my-vault');
    expect(parsed.source).toBe('default');
  });

  test('--json with nothing configured emits {"vault":null,"path":null,"source":"none"}', async () => {
    mockVaults = [];
    const out = await captureStdout(() => command.run(['--json']));
    const parsed = JSON.parse(out) as { vault: null; path: null; source: string };
    expect(parsed.vault).toBeNull();
    expect(parsed.path).toBeNull();
    expect(parsed.source).toBe('none');
  });

  test('--vault <name> with registered vault shows that vault', async () => {
    mockVaults = [{ path: '/abs/my-vault' }];

    const out = await captureStdout(() => command.run(['--vault', 'my-vault']));

    expect(out).toContain('my-vault');
    expect(out).toContain('/abs/my-vault');
  });

  test('--vault <name> with unregistered vault prints help and exits 0', async () => {
    mockVaults = [];

    const out = await captureStdout(() => command.run(['--vault', 'ghost']));

    expect(out).toContain('"ghost" is not registered');
    expect(out).toContain('nerv list-vaults');
  });
});
