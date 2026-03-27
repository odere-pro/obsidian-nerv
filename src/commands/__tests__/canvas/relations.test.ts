// Tests buildRelationsCanvas as a pure function with mock edge data.
// No Obsidian required.

import { describe, expect, test } from 'bun:test';
import { EDGE_COLORS } from '../../../lib/canvas';
import { buildRelationsCanvas } from '../../canvas/relations';
import type { Edge } from '../../cli-relations';

// ---------------------------------------------------------------------------
// Edge color tests
// ---------------------------------------------------------------------------

describe('buildRelationsCanvas — edge coloring', () => {
  const REL_TYPES = ['parent-of', 'depends-on', 'related-to', 'triggers', 'implements'] as const;

  test('each supported relationship type produces a colored edge', () => {
    const edges: Edge[] = REL_TYPES.map((rel, i) => ({
      source: `note-${i}`,
      target: `note-${i + 10}`,
      rel,
      context: '',
    }));

    const canvas = buildRelationsCanvas({ noteNames: [], edges });

    for (const rel of REL_TYPES) {
      const edge = canvas.edges.find(e => e.label === rel);
      expect(edge).toBeDefined();
      expect(edge!.color).toBe(EDGE_COLORS[rel]);
    }
  });

  test('parent-of edges are colored blue', () => {
    const edges: Edge[] = [{ source: 'a', target: 'b', rel: 'parent-of', context: '' }];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });
    expect(canvas.edges[0].color).toBe('#4488FF');
  });

  test('depends-on edges are colored purple', () => {
    const edges: Edge[] = [{ source: 'a', target: 'b', rel: 'depends-on', context: '' }];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });
    expect(canvas.edges[0].color).toBe('#9955FF');
  });

  test('related-to edges are colored gray', () => {
    const edges: Edge[] = [{ source: 'a', target: 'b', rel: 'related-to', context: '' }];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });
    expect(canvas.edges[0].color).toBe('#888888');
  });

  test('triggers edges are colored green', () => {
    const edges: Edge[] = [{ source: 'a', target: 'b', rel: 'triggers', context: '' }];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });
    expect(canvas.edges[0].color).toBe('#44BB44');
  });

  test('implements edges are colored orange', () => {
    const edges: Edge[] = [{ source: 'a', target: 'b', rel: 'implements', context: '' }];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });
    expect(canvas.edges[0].color).toBe('#FF8800');
  });
});

// ---------------------------------------------------------------------------
// Edge label tests
// ---------------------------------------------------------------------------

describe('buildRelationsCanvas — edge labels', () => {
  test('each edge carries the relationship type as its label', () => {
    const edges: Edge[] = [
      { source: 'x', target: 'y', rel: 'depends-on', context: '' },
      { source: 'y', target: 'z', rel: 'triggers', context: '' },
    ];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });

    const labels = canvas.edges.map(e => e.label);
    expect(labels).toContain('depends-on');
    expect(labels).toContain('triggers');
  });
});

// ---------------------------------------------------------------------------
// Node generation tests
// ---------------------------------------------------------------------------

describe('buildRelationsCanvas — node generation', () => {
  test('creates nodes for all sources and targets', () => {
    const edges: Edge[] = [
      { source: 'a', target: 'b', rel: 'related-to', context: '' },
      { source: 'b', target: 'c', rel: 'depends-on', context: '' },
    ];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });
    const nodeNames = canvas.nodes.map(n => n.text);

    expect(nodeNames).toContain('a');
    expect(nodeNames).toContain('b');
    expect(nodeNames).toContain('c');
    expect(canvas.nodes).toHaveLength(3);
  });

  test('node IDs are unique 16-char hex strings', () => {
    const edges: Edge[] = [
      { source: 'note-a', target: 'note-b', rel: 'parent-of', context: '' },
      { source: 'note-b', target: 'note-c', rel: 'parent-of', context: '' },
    ];
    const canvas = buildRelationsCanvas({ noteNames: [], edges });

    for (const node of canvas.nodes) {
      expect(node.id).toMatch(/^[0-9a-f]{16}$/);
    }
    const ids = canvas.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('empty edges produces empty canvas', () => {
    const canvas = buildRelationsCanvas({ noteNames: [], edges: [] });
    expect(canvas.nodes).toHaveLength(0);
    expect(canvas.edges).toHaveLength(0);
  });
});
