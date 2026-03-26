// STORY-039 — JSON Canvas 1.0 spec compliance tests
// Validates that all canvas generators produce spec-compliant output.
// Spec: https://jsoncanvas.org/spec/1.0/
//
// Spec requirements:
//   nodes: each must have id, type, x, y, width, height
//   edges: each must have id, fromNode, toNode, fromSide, toSide, toEnd
//   IDs: 16-character lowercase hex strings

import { describe, expect, test } from 'bun:test';
import { buildTreeCanvas } from '../../canvas/tree.ts';
import { buildRelationsCanvas } from '../../canvas/relations.ts';
import { buildDependenciesCanvas } from '../../canvas/dependencies.ts';
import type { TreeNode } from '../../get-tree.ts';
import type { CanvasData, CanvasNode, CanvasEdge } from '../../../lib/canvas.ts';
import type { Edge } from '../../cli-relations.ts';

// ---------------------------------------------------------------------------
// Shared spec validator
// ---------------------------------------------------------------------------

const HEX_16 = /^[0-9a-f]{16}$/;
const VALID_SIDES = new Set(['top', 'bottom', 'left', 'right']);

function assertNodeCompliance(node: CanvasNode): void {
  expect(node.id).toMatch(HEX_16);
  expect(node.type).toBe('text');
  expect(typeof node.x).toBe('number');
  expect(typeof node.y).toBe('number');
  expect(typeof node.width).toBe('number');
  expect(typeof node.height).toBe('number');
  expect(node.width).toBeGreaterThan(0);
  expect(node.height).toBeGreaterThan(0);
}

function assertEdgeCompliance(edge: CanvasEdge): void {
  expect(edge.id).toMatch(HEX_16);
  expect(typeof edge.fromNode).toBe('string');
  expect(typeof edge.toNode).toBe('string');
  expect(VALID_SIDES.has(edge.fromSide)).toBe(true);
  expect(VALID_SIDES.has(edge.toSide)).toBe(true);
  expect(edge.toEnd).toBe('arrow');
}

function assertCanvasCompliance(canvas: CanvasData): void {
  // Top-level structure
  expect(canvas).toHaveProperty('nodes');
  expect(canvas).toHaveProperty('edges');
  expect(Array.isArray(canvas.nodes)).toBe(true);
  expect(Array.isArray(canvas.edges)).toBe(true);

  // Node IDs are unique
  const nodeIds = canvas.nodes.map(n => n.id);
  expect(new Set(nodeIds).size).toBe(nodeIds.length);

  // Edge IDs are unique
  const edgeIds = canvas.edges.map(e => e.id);
  expect(new Set(edgeIds).size).toBe(edgeIds.length);

  // All referenced node IDs exist
  const nodeIdSet = new Set(nodeIds);
  for (const edge of canvas.edges) {
    expect(nodeIdSet.has(edge.fromNode)).toBe(true);
    expect(nodeIdSet.has(edge.toNode)).toBe(true);
  }

  for (const node of canvas.nodes) assertNodeCompliance(node);
  for (const edge of canvas.edges) assertEdgeCompliance(edge);
}

// ---------------------------------------------------------------------------
// canvas:tree spec compliance
// ---------------------------------------------------------------------------

describe('spec compliance — canvas:tree', () => {
  function makeNode(path: string, type: string, subtree: TreeNode[] = []): TreeNode {
    return {
      path,
      title: path.split('/').pop()!.replace('.md', ''),
      type,
      kind: '',
      status: '',
      subtree,
    };
  }

  test('3-level tree produces spec-compliant JSON Canvas', () => {
    const leaf = makeNode('projects/p/leaf.md', 'LEAF');
    const branch = makeNode('projects/p/branch.md', 'BRANCH', [leaf]);
    const root = makeNode('projects/p/root.md', 'ROOT', [branch]);
    const canvas = buildTreeCanvas([root]);
    assertCanvasCompliance(canvas);
  });

  test('all node IDs are 16-char hex strings', () => {
    const root = makeNode('projects/p/root.md', 'ROOT');
    const canvas = buildTreeCanvas([root]);
    for (const node of canvas.nodes) {
      expect(node.id).toMatch(HEX_16);
    }
  });

  test('all edges have required spec fields', () => {
    const child = makeNode('projects/p/child.md', 'LEAF');
    const root = makeNode('projects/p/root.md', 'ROOT', [child]);
    const canvas = buildTreeCanvas([root]);
    for (const edge of canvas.edges) {
      assertEdgeCompliance(edge);
    }
  });

  test('canvas structure has only nodes and edges keys at top level', () => {
    const root = makeNode('projects/p/root.md', 'ROOT');
    const canvas = buildTreeCanvas([root]);
    // JSON Canvas 1.0 spec: root object has nodes[] and edges[]
    expect(Object.keys(canvas).sort()).toEqual(['edges', 'nodes']);
  });
});

// ---------------------------------------------------------------------------
// canvas:relations spec compliance
// ---------------------------------------------------------------------------

describe('spec compliance — canvas:relations', () => {
  const sampleEdges: Edge[] = [
    { source: 'alpha', target: 'beta', rel: 'depends-on', context: '' },
    { source: 'beta', target: 'gamma', rel: 'triggers', context: '' },
    { source: 'gamma', target: 'alpha', rel: 'related-to', context: '' },
  ];

  test('produces spec-compliant canvas with mixed relationship types', () => {
    const canvas = buildRelationsCanvas({ noteNames: [], edges: sampleEdges });
    assertCanvasCompliance(canvas);
  });

  test('all node IDs are 16-char hex', () => {
    const canvas = buildRelationsCanvas({ noteNames: [], edges: sampleEdges });
    for (const node of canvas.nodes) {
      expect(node.id).toMatch(HEX_16);
    }
  });
});

// ---------------------------------------------------------------------------
// canvas:dependencies spec compliance
// ---------------------------------------------------------------------------

describe('spec compliance — canvas:dependencies', () => {
  const sampleEdges = [
    { source: 'story-a', target: 'story-b' },
    { source: 'story-b', target: 'story-c' },
    { source: 'story-a', target: 'story-c' },
  ];

  test('produces spec-compliant canvas from depends-on edges', () => {
    const canvas = buildDependenciesCanvas(sampleEdges);
    assertCanvasCompliance(canvas);
  });

  test('all node IDs are 16-char hex', () => {
    const canvas = buildDependenciesCanvas(sampleEdges);
    for (const node of canvas.nodes) {
      expect(node.id).toMatch(HEX_16);
    }
  });

  test('all edges have toEnd: "arrow"', () => {
    const canvas = buildDependenciesCanvas(sampleEdges);
    for (const edge of canvas.edges) {
      expect(edge.toEnd).toBe('arrow');
    }
  });
});
