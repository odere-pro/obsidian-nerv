// STORY-033 — Unit tests for create-project command
// Mocks obEval so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock obsidian before importing the command
// ---------------------------------------------------------------------------
const mockObEval = mock(async (_vault: string, _expr: string): Promise<string> => 'ok');
const mockRollbackLog = mock(
  async (_v: string, _op: string, _st: string): Promise<void> => undefined
);

mock.module('../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mockObEval,
  rollbackLog: mockRollbackLog,
  dailyAppend: mock(async (): Promise<void> => undefined),
}));

const { createProject } = await import('../create-project');

describe('create-project', () => {
  beforeEach(() => {
    mockObEval.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Slug validation
  // ---------------------------------------------------------------------------
  describe('slug validation', () => {
    test('accepts a valid lowercase-alphanumeric slug', async () => {
      // First call: idempotency check → absent. Subsequent calls: folder + 5 files.
      mockObEval.mockImplementation(async () => 'absent');
      // Should not throw
      await createProject({ vault: 'v', slug: 'my-project', title: 'My Project' });
      expect(mockObEval).toHaveBeenCalled();
    });

    test('accepts a slug with numbers', async () => {
      mockObEval.mockImplementation(async () => 'absent');
      await createProject({ vault: 'v', slug: 'proj123', title: 'Proj' });
      expect(mockObEval).toHaveBeenCalled();
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
      mockObEval.mockImplementation(async () => 'exists');
      const out: string[] = [];
      const orig = process.stdout.write.bind(process.stdout);
      process.stdout.write = (s: string) => {
        out.push(s);
        return true;
      };
      try {
        await createProject({ vault: 'v', slug: 'my-proj', title: 'T' });
      } finally {
        process.stdout.write = orig;
      }
      // Only one obEval call (idempotency check) — no file creation
      expect(mockObEval).toHaveBeenCalledTimes(1);
      expect(out.join('')).toContain('already exists');
    });
  });

  // ---------------------------------------------------------------------------
  // File path generation
  // ---------------------------------------------------------------------------
  describe('file path generation', () => {
    test('creates ROOT note at projects/<slug>/<SLUG>.ROOT - <Title>.md', async () => {
      mockObEval.mockImplementation(async () => 'absent');
      await createProject({ vault: 'v', slug: 'testslug', title: 'Test Title' });

      const calls = mockObEval.mock.calls.map(c => c[1] as string);
      const createCalls = calls.filter(c => c.includes('vault.create'));
      expect(createCalls.some(c => c.includes('TESTSLUG.ROOT - Test Title.md'))).toBe(true);
    });

    test('creates _ontology, _vocab, _topk and .base files', async () => {
      mockObEval.mockImplementation(async () => 'absent');
      await createProject({ vault: 'v', slug: 'proj', title: 'Proj Title' });

      const calls = mockObEval.mock.calls.map(c => c[1] as string);
      const createCalls = calls.filter(c => c.includes('vault.create'));
      expect(createCalls.some(c => c.includes('_ontology.proj.md'))).toBe(true);
      expect(createCalls.some(c => c.includes('_vocab.proj.md'))).toBe(true);
      expect(createCalls.some(c => c.includes('_topk.proj.md'))).toBe(true);
      expect(createCalls.some(c => c.includes('proj.base'))).toBe(true);
    });

    test('derives SLUG_UPPER correctly for multi-segment slug', async () => {
      mockObEval.mockImplementation(async () => 'absent');
      await createProject({ vault: 'v', slug: 'my-proj', title: 'T' });

      const calls = mockObEval.mock.calls.map(c => c[1] as string);
      expect(calls.some(c => c.includes('MY-PROJ.ROOT'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // vault=<name> keyword form
  // ---------------------------------------------------------------------------
  test('accepts vault=<name> keyword argument form (resolved by resolveVault)', async () => {
    mockObEval.mockImplementation(async () => 'absent');
    // resolveVault is mocked to return arg as-is so vault=study → 'vault=study'
    // Just verifying createProject doesn't blow up when given that form
    await createProject({ vault: 'vault=study', slug: 'p', title: 'T' });
    expect(mockObEval).toHaveBeenCalled();
  });
});
