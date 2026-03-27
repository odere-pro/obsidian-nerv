import { describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type VaultEntry = { name: string; path: string; isDefault?: boolean };

const registeredVaults: Record<string, VaultEntry> = {
  'my-vault': { name: 'my-vault', path: '/abs/my-vault' },
  'default-vault': { name: 'default-vault', path: '/abs/default-vault', isDefault: true },
};

const mockUnregisterVault = mock(async (_name: string): Promise<void> => {});
const mockLookupVault = mock(async (name: string): Promise<VaultEntry> => {
  const entry = registeredVaults[name];
  if (!entry) throw new Error(`No vault named "${name}" is registered. Run: nerv list-vaults`);
  return entry;
});
const mockLogError = mock((_msg: string): never => {
  throw new Error(_msg);
});

mock.module('../../lib/vault-registry', () => ({
  extractVaultFlag: (args: string[]): { vault: string | undefined; rest: string[] } => {
    const idx = args.indexOf('--vault');
    if (idx === -1) return { vault: undefined, rest: args };
    const value = args[idx + 1];
    const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
    return { vault: value, rest };
  },
  unregisterVault: mockUnregisterVault,
  lookupVault: mockLookupVault,
}));

mock.module('../../lib/logger', () => ({
  logError: mockLogError,
}));

const { default: command } = await import('../remove-vault');

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

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit.bind(process);
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  process.exit = (_code?: number): never => {
    throw new Error(`exit:${String(_code ?? 0)}`);
  };
  try {
    await fn();
    return output;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('exit:')) return output;
    throw err;
  } finally {
    process.stderr.write = original;
    process.exit = originalExit;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('remove-vault', () => {
  test('calls unregisterVault and prints success for registered vault with --force', async () => {
    mockUnregisterVault.mockClear();
    mockLookupVault.mockClear();

    const out = await captureStdout(() => command.run(['--vault', 'my-vault', '--force']));

    expect(mockUnregisterVault).toHaveBeenCalledWith('my-vault');
    expect(out).toContain("Removed vault 'my-vault' from registry.");
    expect(out).toContain('/abs/my-vault');
    expect(out).not.toContain('Warning');
  });

  test('prints warning when removed vault was the default', async () => {
    mockUnregisterVault.mockClear();

    const out = await captureStdout(() => command.run(['--vault', 'default-vault', '--force']));

    expect(out).toContain("Removed vault 'default-vault' from registry.");
    expect(out).toContain('Warning: no default vault is set');
  });

  test('exits 1 with confirmation instruction when --force is absent', async () => {
    const err = await captureStderr(() => command.run(['--vault', 'my-vault']));
    expect(err).toContain('--force is required');
    expect(err).toContain('nerv remove-vault --vault my-vault --force');
  });

  test('calls logError when --vault flag is absent', async () => {
    expect(() => command.run([])).toThrow('--vault');
  });

  test('propagates error from unregisterVault for unregistered vault', async () => {
    await expect(command.run(['--vault', 'ghost', '--force'])).rejects.toThrow('ghost');
  });
});
