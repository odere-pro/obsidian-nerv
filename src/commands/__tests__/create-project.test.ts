// Mocks VaultOps so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { VaultOps } from '../../ports/vault-ops';

// ---------------------------------------------------------------------------
// Mock obsidian (for rollbackLog / resolveVault) and provider (for VaultOps)
// ---------------------------------------------------------------------------
const mockRollbackLog = mock(
  async (_v: string, _op: string, _st: string): Promise<void> => undefined
);

mock.module('../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  rollbackLog: mockRollbackLog,
}));

const mockFileExists = mock(async (_v: string, _p: string): Promise<boolean> => false);
const mockCreateFile = mock(async (_v: string, _p: string, _c: string): Promise<void> => undefined);

const mockOps: VaultOps = {
  fileExists: mockFileExists,
  createFile: mockCreateFile,
  readFile: mock(async () => ({ path: '', content: '', frontmatter: {} })),
  updateFrontmatter: mock(async () => undefined),
  listFiles: mock(async () => []),
  appendToDaily: mock(async () => undefined),
  openDaily: mock(async () => undefined),
  listRecentFiles: mock(async () => []),
  listUnresolved: mock(async () => []),
  trashFile: mock(async () => undefined),
  appendToFile: mock(async () => undefined),
  replaceFileContent: mock(async () => undefined),
};

mock.module('../../ports/provider', () => ({
  getVaultOps: (): VaultOps => mockOps,
}));

const { createProject } = await import('../create-project');

describe('create-project', () => {
  beforeEach(() => {
    mockFileExists.mockReset();
    mockCreateFile.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Slug validation
  // ---------------------------------------------------------------------------
  describe('slug validation', () => {
    test('accepts a valid lowercase-alphanumeric slug', async () => {
      mockFileExists.mockImplementation(async () => false);
      mockCreateFile.mockImplementation(async () => undefined);
      await createProject({ vault: 'v', slug: 'my-project', title: 'My Project' });
      expect(mockCreateFile).toHaveBeenCalled();
    });

    test('accepts a slug with numbers', async () => {
      mockFileExists.mockImplementation(async () => false);
      mockCreateFile.mockImplementation(async () => undefined);
      await createProject({ vault: 'v', slug: 'proj123', title: 'Proj' });
      expect(mockCreateFile).toHaveBeenCalled();
    });

    test('rejects a slug with uppercase letters', async () => {
      expect(createProject({ vault: 'v', slug: 'BadSlug', title: 'T' })).rejects.toThrow();
    });

    test('rejects a slug with path traversal characters', async () => {
      expect(createProject({ vault: 'v', slug: '../etc', title: 'T' })).rejects.toThrow();
    });

    test('rejects an empty slug', async () => {
      expect(createProject({ vault: 'v', slug: '', title: 'T' })).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------
  describe('idempotency', () => {
    test('exits 0 without modification when ROOT already exists', async () => {
      mockFileExists.mockImplementation(async () => true);
      const out: string[] = [];
      const orig = process.stdout.write.bind(process.stdout);
      process.stdout.write = (s: string): boolean => {
        out.push(s);
        return true;
      };
      try {
        await createProject({ vault: 'v', slug: 'my-proj', title: 'T' });
      } finally {
        process.stdout.write = orig;
      }
      // Only one fileExists call (idempotency check) — no file creation
      expect(mockFileExists).toHaveBeenCalledTimes(1);
      expect(mockCreateFile).not.toHaveBeenCalled();
      expect(out.join('')).toContain('already exists');
    });
  });

  // ---------------------------------------------------------------------------
  // File path generation
  // ---------------------------------------------------------------------------
  describe('file path generation', () => {
    test('creates ROOT note at projects/<slug>/<SLUG>.ROOT - <Title>.md', async () => {
      mockFileExists.mockImplementation(async () => false);
      mockCreateFile.mockImplementation(async () => undefined);
      await createProject({ vault: 'v', slug: 'testslug', title: 'Test Title' });

      const paths = mockCreateFile.mock.calls.map(c => c[1] as string);
      expect(paths.some(p => p.includes('TESTSLUG.ROOT - Test Title.md'))).toBe(true);
    });

    test('creates _ontology, _vocab, _topk and .base files', async () => {
      mockFileExists.mockImplementation(async () => false);
      mockCreateFile.mockImplementation(async () => undefined);
      await createProject({ vault: 'v', slug: 'proj', title: 'Proj Title' });

      const paths = mockCreateFile.mock.calls.map(c => c[1] as string);
      expect(paths.some(p => p.includes('_ontology.proj.md'))).toBe(true);
      expect(paths.some(p => p.includes('_vocab.proj.md'))).toBe(true);
      expect(paths.some(p => p.includes('_topk.proj.md'))).toBe(true);
      expect(paths.some(p => p.includes('proj.base'))).toBe(true);
    });

    test('derives SLUG_UPPER correctly for multi-segment slug', async () => {
      mockFileExists.mockImplementation(async () => false);
      mockCreateFile.mockImplementation(async () => undefined);
      await createProject({ vault: 'v', slug: 'my-proj', title: 'T' });

      const paths = mockCreateFile.mock.calls.map(c => c[1] as string);
      expect(paths.some(p => p.includes('MY-PROJ.ROOT'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // --vault flag form
  // ---------------------------------------------------------------------------
  test('accepts --vault flag form (resolved by resolveVault)', async () => {
    mockFileExists.mockImplementation(async () => false);
    mockCreateFile.mockImplementation(async () => undefined);
    await createProject({ vault: 'study', slug: 'p', title: 'T' });
    expect(mockCreateFile).toHaveBeenCalled();
  });
});
