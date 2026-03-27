// Tests buildTree as a pure function with mock FlatNote data.
// No Obsidian or obEval required.

import { describe, expect, test } from 'bun:test';
import { buildTree, type FlatNote } from '../get-tree';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<FlatNote> & { basename: string }): FlatNote {
  return {
    path: `projects/test/${overrides.basename}.md`,
    title: overrides.basename,
    type: 'LEAF',
    kind: 'concept',
    status: 'draft',
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basic tree building
// ---------------------------------------------------------------------------

describe('buildTree — basic structure', () => {
  test('builds a 3-level ROOT > BRANCH > LEAF tree', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT', type: 'ROOT', children: ['[[BRANCH]]'] }),
      makeNote({ basename: 'BRANCH', type: 'BRANCH', children: ['[[LEAF]]'] }),
      makeNote({ basename: 'LEAF', type: 'LEAF', children: [] }),
    ];

    const result = buildTree(notes);
    expect(result.tree).toHaveLength(1);

    const root = result.tree[0];
    expect(root.type).toBe('ROOT');
    expect(root.subtree).toHaveLength(1);

    const branch = root.subtree[0];
    expect('missing' in branch || 'cycle' in branch).toBe(false);
    if (!('missing' in branch) && !('cycle' in branch)) {
      expect(branch.type).toBe('BRANCH');
      expect(branch.subtree).toHaveLength(1);
    }
  });

  test('nodeCount matches total nodes traversed', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT', type: 'ROOT', children: ['[[A]]', '[[B]]'] }),
      makeNote({ basename: 'A', type: 'LEAF', children: [] }),
      makeNote({ basename: 'B', type: 'LEAF', children: [] }),
    ];
    const result = buildTree(notes);
    expect(result.nodeCount).toBe(3); // ROOT + A + B
  });

  test('multiple ROOT nodes each appear at tree top level', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT1', type: 'ROOT', children: [] }),
      makeNote({ basename: 'ROOT2', type: 'ROOT', children: [] }),
    ];
    const result = buildTree(notes);
    expect(result.tree).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Missing children
// ---------------------------------------------------------------------------

describe('buildTree — missing children', () => {
  test('inserts {missing} node for unresolvable child reference', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT', type: 'ROOT', children: ['[[GHOST]]'] }),
    ];
    const result = buildTree(notes);
    const root = result.tree[0];
    expect(root.subtree).toHaveLength(1);
    expect(root.subtree[0]).toEqual({ missing: 'GHOST' });
  });
});

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

describe('buildTree — cycle detection', () => {
  test('inserts {cycle} node when a child path already visited', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT', type: 'ROOT', children: ['[[BRANCH]]'] }),
      makeNote({ basename: 'BRANCH', type: 'BRANCH', children: ['[[ROOT]]'] }), // cycle back to ROOT
    ];
    const result = buildTree(notes);
    const root = result.tree[0];
    const branch = root.subtree[0];
    if (!('missing' in branch) && !('cycle' in branch)) {
      const cycleNode = branch.subtree[0];
      expect('cycle' in cycleNode).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Depth limiting
// ---------------------------------------------------------------------------

describe('buildTree — depth limiting', () => {
  test('respects maxDepth parameter', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT', type: 'ROOT', children: ['[[L1]]'] }),
      makeNote({ basename: 'L1', type: 'BRANCH', children: ['[[L2]]'] }),
      makeNote({ basename: 'L2', type: 'BRANCH', children: ['[[L3]]'] }),
      makeNote({ basename: 'L3', type: 'LEAF', children: [] }),
    ];
    const result = buildTree(notes, 1); // depth 1: ROOT can have children, but children cannot
    const root = result.tree[0];
    expect(root.subtree).toHaveLength(1);
    const l1 = root.subtree[0];
    if (!('missing' in l1) && !('cycle' in l1)) {
      // L1 is at depth 1, which equals maxDepth — its subtree should be empty
      expect(l1.subtree).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Plain basename children (no wikilink syntax)
// ---------------------------------------------------------------------------

describe('buildTree — wikilink resolution', () => {
  test('resolves [[wikilink]] syntax in children array', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT', type: 'ROOT', children: ['[[CHILD]]'] }),
      makeNote({ basename: 'CHILD', type: 'LEAF', children: [] }),
    ];
    const result = buildTree(notes);
    const root = result.tree[0];
    const child = root.subtree[0];
    expect('missing' in child).toBe(false);
    if (!('missing' in child) && !('cycle' in child)) {
      expect(child.basename ?? child.title).toBe('CHILD');
    }
  });

  test('resolves plain basename (no brackets) in children array', () => {
    const notes: FlatNote[] = [
      makeNote({ basename: 'ROOT', type: 'ROOT', children: ['CHILD'] }),
      makeNote({ basename: 'CHILD', type: 'LEAF', children: [] }),
    ];
    const result = buildTree(notes);
    const root = result.tree[0];
    const child = root.subtree[0];
    expect('missing' in child).toBe(false);
  });
});
