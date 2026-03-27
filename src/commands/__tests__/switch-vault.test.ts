import { describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetDefaultVault = mock(async (_name: string): Promise<void> => {});
const mockLookupVault = mock(async (name: string) => ({ name, path: `/abs/${name}` }));
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
  setDefaultVault: mockSetDefaultVault,
  lookupVault: mockLookupVault,
}));

mock.module('../../lib/logger', () => ({
  logError: mockLogError,
}));

const { default: command } = await import('../switch-vault');

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

describe('switch-vault', () => {
  test('calls setDefaultVault and prints success message for registered vault', async () => {
    mockSetDefaultVault.mockClear();
    mockLookupVault.mockClear();

    const out = await captureStdout(() => command.run(['--vault', 'my-vault']));

    expect(mockSetDefaultVault).toHaveBeenCalledWith('my-vault');
    expect(out).toContain("Default vault set to 'my-vault'");
    expect(out).toContain('/abs/my-vault');
  });

  test('calls logError when --vault flag is absent', async () => {
    expect(() => command.run([])).toThrow('--vault');
  });

  test('propagates logError from setDefaultVault for unregistered vault', async () => {
    mockSetDefaultVault.mockImplementationOnce(async (_name: string): Promise<void> => {
      throw new Error('No vault named "ghost" is registered');
    });

    await expect(command.run(['--vault', 'ghost'])).rejects.toThrow('ghost');
  });
});
