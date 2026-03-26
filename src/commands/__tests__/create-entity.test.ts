// STORY-033 — Unit tests for create-entity command
// Mocks obEval so no Obsidian instance is required.

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock obsidian.ts before importing the command
// ---------------------------------------------------------------------------
const mockObEval = mock(async (_vault: string, _expr: string): Promise<string> => 'ok');
const mockDailyAppend = mock(async (): Promise<void> => undefined);
const mockRollbackLog = mock(async (): Promise<void> => undefined);

mock.module('../../lib/obsidian.ts', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mockObEval,
  dailyAppend: mockDailyAppend,
  rollbackLog: mockRollbackLog,
}));

const { createEntity, resolveNotePath } = await import('../create-entity.ts');

// ---------------------------------------------------------------------------
// Helpers to set up standard mock response sequence:
//   1. idempotency check → 'absent'
//   2. parent lookup → JSON with basename + spine
//   3. file create → 'ok'
//   4. parent children update → 'ok'
// ---------------------------------------------------------------------------
function setupSuccessMocks(parentBasename: string, parentSpine: string): void {
  mockObEval.mockImplementation(async (_vault: string, expr: string) => {
    if (expr.includes("'exists'") || expr.includes("'absent'")) return 'absent';
    if (expr.includes('getFiles') && expr.includes('startsWith(prefix)')) {
      return JSON.stringify({ basename: parentBasename, spine: parentSpine });
    }
    if (expr.includes('vault.create')) return 'ok';
    if (expr.includes('processFrontMatter')) return 'ok';
    return 'ok';
  });
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
    mockObEval.mockReset();
    mockDailyAppend.mockReset();
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
    test('passes entity wikilink to processFrontMatter for parent update', async () => {
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
      const calls = mockObEval.mock.calls.map(c => c[1] as string);
      const updateCall = calls.find(c => c.includes('processFrontMatter'));
      expect(updateCall).toBeDefined();
      expect(updateCall).toContain('PROJ.leaf - Leaf');
    });

    test('returns error when parent note is not found', async () => {
      mockObEval.mockImplementation(async (_v: string, expr: string) => {
        if (expr.includes("'absent'")) return 'absent';
        if (expr.includes('getFiles') && expr.includes('startsWith(prefix)')) return 'NOT_FOUND';
        return 'ok';
      });
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
      const calls = mockObEval.mock.calls.map(c => c[1] as string);
      const createCall = calls.find(c => c.includes('vault.create'));
      expect(createCall).toContain('custom-spine');
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
      const calls = mockObEval.mock.calls.map(c => c[1] as string);
      const createCall = calls.find(c => c.includes('vault.create'));
      expect(createCall).toContain('parent-spine');
    });

    test('falls back to project slug when neither spine arg nor parent spine', async () => {
      setupSuccessMocks('PROJ.ROOT - Title', '');
      await createEntity({
        vault: 'v',
        project: 'myproj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      const calls = mockObEval.mock.calls.map(c => c[1] as string);
      const createCall = calls.find(c => c.includes('vault.create'));
      expect(createCall).toContain('myproj');
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
      mockObEval.mockImplementation(async (_v: string, expr: string) => {
        if (expr.includes("'exists'") || expr.includes("'absent'")) return 'exists';
        return 'ok';
      });
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
      mockObEval.mockImplementation(async (_v: string, expr: string) => {
        if (expr.includes("'absent'")) return 'absent';
        if (expr.includes('startsWith(prefix)')) return 'NOT_FOUND';
        return 'ok';
      });
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
