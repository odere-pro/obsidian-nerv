// Uses MockVaultOps for stateful vault assertions — no Obsidian instance required.

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as obsidianLib from '../../../src/lib/obsidian';
import * as provider from '../../../src/ports/provider';
import { MockVaultOps } from '../../../src/ports/mock-vault-ops';
import { createEntity, resolveNotePath } from '../../../src/commands/create-entity';

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
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
    spyOn(obsidianLib, 'rollbackLog').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  /** Seed a parent note into the in-memory vault. */
  function seedParent(
    opts: { basename?: string; spine?: string; children?: string[]; project?: string } = {}
  ): void {
    const project = opts.project ?? 'proj';
    const basename = opts.basename ?? 'PROJ.ROOT - Title';
    const spine = opts.spine ?? 'proj';
    const children = opts.children ?? [];
    mockOps.seedFile('v', `projects/${project}/${basename}.md`, '', { spine, children });
  }

  // ---------------------------------------------------------------------------
  // Path generation for each type
  // ---------------------------------------------------------------------------
  describe('path generation', () => {
    test('creates LEAF at correct vault path', async () => {
      seedParent();
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
      expect(await mockOps.fileExists('v', 'projects/proj/PROJ.my-leaf - My Leaf.md')).toBe(true);
    });

    test('creates BRANCH at correct vault path', async () => {
      seedParent();
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
      expect(await mockOps.fileExists('v', 'projects/proj/PROJ.my-branch - My Branch.md')).toBe(
        true
      );
    });

    test('creates ROOT at correct vault path', async () => {
      seedParent();
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
      expect(await mockOps.fileExists('v', 'projects/proj/PROJ.sub-root - Sub Root.md')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Parent wiring
  // ---------------------------------------------------------------------------
  describe('parent wiring', () => {
    test('updates parent children to include new entity wikilink', async () => {
      seedParent({ basename: 'PROJ.ROOT - Project Root' });
      await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      const parent = await mockOps.readFile('v', 'projects/proj/PROJ.ROOT - Project Root.md');
      const children = parent.frontmatter.children as string[];
      expect(children).toContain('[[PROJ.leaf - Leaf]]');
    });

    test('returns error when parent note is not found', async () => {
      // Don't seed any parent
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
      seedParent();
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
      const file = await mockOps.readFile('v', 'projects/proj/PROJ.leaf - Leaf.md');
      expect(file.content).toContain('custom-spine');
    });

    test('inherits spine from parent when spine arg is omitted', async () => {
      seedParent({ spine: 'parent-spine' });
      await createEntity({
        vault: 'v',
        project: 'proj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      const file = await mockOps.readFile('v', 'projects/proj/PROJ.leaf - Leaf.md');
      expect(file.content).toContain('parent-spine');
    });

    test('falls back to project slug when neither spine arg nor parent spine', async () => {
      mockOps.seedFile('v', 'projects/myproj/MYPROJ.ROOT - Title.md', '', {
        spine: '',
        children: [],
      });
      await createEntity({
        vault: 'v',
        project: 'myproj',
        type: 'LEAF',
        slug: 'leaf',
        title: 'Leaf',
        parentSlug: 'ROOT',
        kind: 'concept',
      });
      const file = await mockOps.readFile('v', 'projects/myproj/MYPROJ.leaf - Leaf.md');
      expect(file.content).toContain('myproj');
    });
  });

  // ---------------------------------------------------------------------------
  // --json output schema
  // ---------------------------------------------------------------------------
  describe('--json output schema', () => {
    test('returns created:true and path on success', async () => {
      seedParent();
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
      // Seed the target file so fileExists returns true
      mockOps.seedFile('v', 'projects/proj/PROJ.existing - Existing.md', '', {});
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
