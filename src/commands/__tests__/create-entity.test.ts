// Mocks VaultOps so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { VaultOps } from '../../ports/vault-ops';

// ---------------------------------------------------------------------------
// Mock obsidian (for rollbackLog / resolveVault) and provider (for VaultOps)
// ---------------------------------------------------------------------------
const mockRollbackLog = mock(async (): Promise<void> => undefined);

mock.module('../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  rollbackLog: mockRollbackLog,
}));

const mockFileExists = mock(async (_v: string, _p: string): Promise<boolean> => false);
const mockListFiles = mock(
  async (_v: string) => [] as { path: string; frontmatter: Record<string, unknown> }[]
);
const mockCreateFile = mock(async (_v: string, _p: string, _c: string): Promise<void> => undefined);
const mockUpdateFrontmatter = mock(
  async (_v: string, _p: string, _m: Record<string, unknown>): Promise<void> => undefined
);
const mockAppendToDaily = mock(async (_v: string, _c: string): Promise<void> => undefined);

const mockOps: VaultOps = {
  fileExists: mockFileExists,
  listFiles: mockListFiles,
  createFile: mockCreateFile,
  updateFrontmatter: mockUpdateFrontmatter,
  appendToDaily: mockAppendToDaily,
  readFile: mock(async () => ({ path: '', content: '', frontmatter: {} })),
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

const { createEntity, resolveNotePath } = await import('../create-entity');

// ---------------------------------------------------------------------------
// Helpers to set up standard mock response sequence:
//   1. fileExists → false (absent)
//   2. listFiles → parent entry with basename + spine
//   3. createFile → ok
//   4. updateFrontmatter → ok
// ---------------------------------------------------------------------------
function setupSuccessMocks(parentBasename: string, parentSpine: string): void {
  mockFileExists.mockImplementation(async () => false);
  mockListFiles.mockImplementation(async () => [
    {
      path: `projects/proj/${parentBasename}.md`,
      frontmatter: { spine: parentSpine, children: [] },
    },
  ]);
  mockCreateFile.mockImplementation(async () => undefined);
  mockUpdateFrontmatter.mockImplementation(async () => undefined);
  mockAppendToDaily.mockImplementation(async () => undefined);
}

describe('resolveNotePath', () => {
  test('generates correct path for a LEAF', () => {
    const path = resolveNotePath('myproj', 'my-leaf', 'My Leaf Title');
    expect(path).toBe('projects/myproj/MYPROJ.my-leaf - My Leaf Title.md');
  });

  test('uppercases project slug in the filename', () => {
    const path = resolveNotePath('testproj', 'slug', 'Title');
    expect(path).toContain('TESTPROJ.');
  });

  test('preserves hyphenated slugs', () => {
    const path = resolveNotePath('proj', 'test-leaf', 'Test Leaf');
    expect(path).toContain('PROJ.test-leaf - Test Leaf.md');
  });
});

describe('createEntity', () => {
  beforeEach(() => {
    mockFileExists.mockReset();
    mockListFiles.mockReset();
    mockCreateFile.mockReset();
    mockUpdateFrontmatter.mockReset();
    mockAppendToDaily.mockReset();
    mockRollbackLog.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Path generation for each type
  // ---------------------------------------------------------------------------
  describe('path generation', () => {
    test('creates LEAF at correct vault path', async () => {
      setupSuccessMocks('PROJ.ROOT - Title', 'proj');
      const result = await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'my-leaf',
        title: 'My Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(result.ok).toBe(true);
      expect(result.data.path).toBe('projects/proj/PROJ.my-leaf - My Leaf.md');
    });

    test('creates BRANCH at correct vault path', async () => {
      setupSuccessMocks('PROJ.ROOT - Title', 'proj');
      const result = await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'BRANCH',
        slug: 'my-branch',
        title: 'My Branch',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(result.ok).toBe(true);
      expect(result.data.path).toBe('projects/proj/PROJ.my-branch - My Branch.md');
    });

    test('creates ROOT at correct vault path', async () => {
      setupSuccessMocks('PROJ.ROOT - Title', 'proj');
      const result = await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'ROOT',
        slug: 'sub-root',
        title: 'Sub Root',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(result.ok).toBe(true);
      expect(result.data.path).toBe('projects/proj/PROJ.sub-root - Sub Root.md');
    });
  });

  // ---------------------------------------------------------------------------
  // Parent wiring
  // ---------------------------------------------------------------------------
  describe('parent wiring', () => {
    test('passes entity wikilink to updateFrontmatter for parent children update', async () => {
      setupSuccessMocks('PROJ.ROOT - Project Root', 'proj');
      await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(mockUpdateFrontmatter).toHaveBeenCalled();
      const call = mockUpdateFrontmatter.mock.calls[0];
      const mutations = call[2] as { children: string[] };
      expect(mutations.children).toContain('[[PROJ.leaf - Leaf]]');
    });

    test('returns error when parent note is not found', async () => {
      mockFileExists.mockImplementation(async () => false);
      mockListFiles.mockImplementation(async () => []);
      const result = await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'NOSUCH',
        kind: 'concept',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ---------------------------------------------------------------------------
  // Spine inheritance
  // ---------------------------------------------------------------------------
  describe('spine inheritance', () => {
    test('uses explicit spine when provided', async () => {
      setupSuccessMocks('PROJ.ROOT - Title', 'proj');
      await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
        spine: 'custom-spine',
      });
      expect(mockCreateFile).toHaveBeenCalled();
      const content = mockCreateFile.mock.calls[0][2] as string;
      expect(content).toContain('custom-spine');
    });

    test('inherits spine from parent when spine arg is omitted', async () => {
      setupSuccessMocks('PROJ.ROOT - Title', 'parent-spine');
      await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(mockCreateFile).toHaveBeenCalled();
      const content = mockCreateFile.mock.calls[0][2] as string;
      expect(content).toContain('parent-spine');
    });

    test('falls back to project slug when neither spine arg nor parent spine', async () => {
      setupSuccessMocks('MYPROJ.ROOT - Title', '');
      mockListFiles.mockImplementation(async () => [
        {
          path: 'projects/myproj/MYPROJ.ROOT - Title.md',
          frontmatter: { spine: '', children: [] },
        },
      ]);
      await createEntity({
        vault: 'v',
        project: 'myproj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(mockCreateFile).toHaveBeenCalled();
      const content = mockCreateFile.mock.calls[0][2] as string;
      expect(content).toContain('myproj');
    });
  });

  // ---------------------------------------------------------------------------
  // --json output schema
  // ---------------------------------------------------------------------------
  describe('--json output schema', () => {
    test('returns created:true and path on success', async () => {
      setupSuccessMocks('PROJ.ROOT - Title', 'proj');
      const result = await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'new-leaf',
        title: 'New Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(result.data.created).toBe(true);
      expect(result.data.path).toBeTruthy();
      expect(result.data.title).toBe('New Leaf');
    });

    test('returns created:false (not error) on idempotent re-run', async () => {
      mockFileExists.mockImplementation(async () => true);
      const result = await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'existing',
        title: 'Existing',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      expect(result.ok).toBe(true);
      expect(result.data.created).toBe(false);
    });

    test('error result has ok:false and error string for missing parent', async () => {
      mockFileExists.mockImplementation(async () => false);
      mockListFiles.mockImplementation(async () => []);
      const result = await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'orphan',
        title: 'Orphan',
        parentSlug: 'NOSUCH',
        kind: 'concept',
      });
      expect(result.ok).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.data.created).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  test('returns error for invalid TYPE', async () => {
    const result = await createEntity({
      vault: 'v',
      project: 'proj',
      type: 'INVALID' as never,
      slug: 'x',
      title: 'X',
      parentSlug: 'ROOT',
      kind: 'concept',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('TYPE must be');
  });

  test('returns error for invalid project slug', async () => {
    const result = await createEntity({
      vault: 'v',
      project: 'Bad Slug',
      type: 'LEAF',
      slug: 'x',
      title: 'X',
      parentSlug: 'ROOT',
      kind: 'concept',
    });
    expect(result.ok).toBe(false);
  });
});
