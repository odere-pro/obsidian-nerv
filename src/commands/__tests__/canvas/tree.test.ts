// Tests buildTreeCanvas as a pure function with mock TreeNode data.
// No Obsidian required.

import { describe, expect, test } from 'bun:test';
import { NODE_GAP_X, NODE_GAP_Y } from '../../../lib/canvas';
import { buildTreeCanvas } from '../../canvas/tree';
import type { TreeNode } from '../../get-tree';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTreeNode(
  overrides: Partial<TreeNode> & { path: string; title: string; type: string }
): TreeNode {
  return {
    path: overrides.path,
    title: overrides.title,
    type: overrides.type,
    kind: '',
    status: '',
    subtree: overrides.subtree ?? [],
  };
}

// ---------------------------------------------------------------------------
// Node generation
// ---------------------------------------------------------------------------

describe('buildTreeCanvas — node generation', () => {
  test('generates one node per tree node in a 3-level hierarchy', () => {
    const leaf = makeTreeNode({ path: 'projects/p/leaf.md', title: 'Leaf', type: 'LEAF' });
    const branch = makeTreeNode({
      path: 'projects/p/branch.md',
      title: 'Branch',
      type: 'BRANCH',
      subtree: [leaf],
    });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [branch],
    });

    const canvas = buildTreeCanvas([root]);
    expect(canvas.nodes).toHaveLength(3);
  });

  test('node IDs are unique 16-character lowercase hex strings', () => {
    const a = makeTreeNode({ path: 'projects/p/a.md', title: 'A', type: 'ROOT' });
    const b = makeTreeNode({ path: 'projects/p/b.md', title: 'B', type: 'LEAF' });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [a, b],
    });

    const canvas = buildTreeCanvas([root]);
    const ids = canvas.nodes.map(n => n.id);

    // All IDs are 16-char lowercase hex
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    }

    // All IDs are unique
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('node x positions increase with depth', () => {
    const leaf = makeTreeNode({ path: 'projects/p/leaf.md', title: 'Leaf', type: 'LEAF' });
    const branch = makeTreeNode({
      path: 'projects/p/branch.md',
      title: 'Branch',
      type: 'BRANCH',
      subtree: [leaf],
    });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [branch],
    });

    const canvas = buildTreeCanvas([root]);

    // Find nodes by title
    const rootNode = canvas.nodes.find(n => n.text === 'Root')!;
    const branchNode = canvas.nodes.find(n => n.text === 'Branch')!;
    const leafNode = canvas.nodes.find(n => n.text === 'Leaf')!;

    expect(rootNode.x).toBe(0);
    expect(branchNode.x).toBe(NODE_GAP_X);
    expect(leafNode.x).toBe(NODE_GAP_X * 2);
  });

  test('sibling nodes have increasing y positions', () => {
    const childA = makeTreeNode({ path: 'projects/p/a.md', title: 'A', type: 'LEAF' });
    const childB = makeTreeNode({ path: 'projects/p/b.md', title: 'B', type: 'LEAF' });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [childA, childB],
    });

    const canvas = buildTreeCanvas([root]);
    const nodeA = canvas.nodes.find(n => n.text === 'A')!;
    const nodeB = canvas.nodes.find(n => n.text === 'B')!;

    expect(nodeB.y).toBeGreaterThan(nodeA.y);
    expect(nodeB.y - nodeA.y).toBe(NODE_GAP_Y);
  });

  test('ROOT nodes colored "1", BRANCH "2", LEAF "3"', () => {
    const leaf = makeTreeNode({ path: 'projects/p/leaf.md', title: 'Leaf', type: 'LEAF' });
    const branch = makeTreeNode({
      path: 'projects/p/branch.md',
      title: 'Branch',
      type: 'BRANCH',
      subtree: [leaf],
    });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [branch],
    });

    const canvas = buildTreeCanvas([root]);

    expect(canvas.nodes.find(n => n.text === 'Root')?.color).toBe('1');
    expect(canvas.nodes.find(n => n.text === 'Branch')?.color).toBe('2');
    expect(canvas.nodes.find(n => n.text === 'Leaf')?.color).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// Edge generation
// ---------------------------------------------------------------------------

describe('buildTreeCanvas — edge generation', () => {
  test('generates one edge per parent-child relationship', () => {
    const child = makeTreeNode({ path: 'projects/p/child.md', title: 'Child', type: 'LEAF' });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [child],
    });

    const canvas = buildTreeCanvas([root]);
    expect(canvas.edges).toHaveLength(1);
  });

  test('edges point downward (fromSide: bottom, toSide: top)', () => {
    const child = makeTreeNode({ path: 'projects/p/child.md', title: 'Child', type: 'LEAF' });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [child],
    });

    const canvas = buildTreeCanvas([root]);
    const edge = canvas.edges[0];
    expect(edge.fromSide).toBe('bottom');
    expect(edge.toSide).toBe('top');
    expect(edge.toEnd).toBe('arrow');
  });

  test('edge fromNode matches parent ID, toNode matches child ID', () => {
    const child = makeTreeNode({ path: 'projects/p/child.md', title: 'Child', type: 'LEAF' });
    const root = makeTreeNode({
      path: 'projects/p/root.md',
      title: 'Root',
      type: 'ROOT',
      subtree: [child],
    });

    const canvas = buildTreeCanvas([root]);
    const rootNode = canvas.nodes.find(n => n.text === 'Root')!;
    const childNode = canvas.nodes.find(n => n.text === 'Child')!;
    const edge = canvas.edges[0];

    expect(edge.fromNode).toBe(rootNode.id);
    expect(edge.toNode).toBe(childNode.id);
  });

  test('empty tree produces no nodes or edges', () => {
    const canvas = buildTreeCanvas([]);
    expect(canvas.nodes).toHaveLength(0);
    expect(canvas.edges).toHaveLength(0);
  });
});
