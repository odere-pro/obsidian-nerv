// Mocks getRelations so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock cli-relations before importing dependency-map
// ---------------------------------------------------------------------------
const mockGetRelations = mock(async () => ({
  project: 'proj',
  edges: [],
  summary: {},
  unknownTypes: [],
}));

// Path resolves from this test file up to src/commands/cli-relations
mock.module('../../cli-relations', () => ({
  getRelations: mockGetRelations,
}));

mock.module('../../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mock(async () => ''),
}));

const { getDependencyMap, edgesToDot } = await import('../../dev/dependency-map');

// ---------------------------------------------------------------------------
// Edge filtering tests
// ---------------------------------------------------------------------------

describe('getDependencyMap', () => {
  beforeEach(() => {
    mockGetRelations.mockReset();
  });

  test('filters to depends-on edges only (excludes related-to and implements)', async () => {
    mockGetRelations.mockImplementation(async () => ({
      project: 'proj',
      edges: [
        { source: 'a', target: 'b', rel: 'depends-on', context: '' },
        { source: 'a', target: 'c', rel: 'related-to', context: '' },
        { source: 'b', target: 'c', rel: 'implements', context: '' },
      ],
      summary: {},
      unknownTypes: [],
    }));

    const result = await getDependencyMap('vault', 'proj');
    expect(result.ok).toBe(true);
    expect(result.data.edges).toHaveLength(1);
    expect(result.data.edges[0]).toMatchObject({ source: 'a', target: 'b' });
  });

  test('returns empty edges when no depends-on relations exist', async () => {
    mockGetRelations.mockImplementation(async () => ({
      project: 'proj',
      edges: [{ source: 'a', target: 'b', rel: 'related-to', context: '' }],
      summary: {},
      unknownTypes: [],
    }));

    const result = await getDependencyMap('vault', 'proj');
    expect(result.ok).toBe(true);
    expect(result.data.edges).toHaveLength(0);
  });

  test('JSON output has project and edges keys', async () => {
    mockGetRelations.mockImplementation(async () => ({
      project: 'proj',
      edges: [],
      summary: {},
      unknownTypes: [],
    }));

    const result = await getDependencyMap('vault', 'proj');
    expect(result.data).toHaveProperty('project');
    expect(result.data).toHaveProperty('edges');
    expect(Array.isArray(result.data.edges)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DOT format tests
// ---------------------------------------------------------------------------

describe('edgesToDot', () => {
  test('output starts with digraph', () => {
    const dot = edgesToDot('proj', [{ source: 'a', target: 'b', context: '' }]);
    expect(dot.trim()).toMatch(/^digraph/);
  });

  test('output contains -> edge syntax', () => {
    const dot = edgesToDot('proj', [{ source: 'a', target: 'b', context: '' }]);
    expect(dot).toContain('->');
  });

  test('DOT output with context includes label attribute', () => {
    const dot = edgesToDot('proj', [{ source: 'a', target: 'b', context: 'for testing' }]);
    expect(dot).toContain('label="for testing"');
  });
});
