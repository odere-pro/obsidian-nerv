// Tests edge extraction from mock connection sections and JSON schema.

import { describe, expect, test } from 'bun:test';
import { extractEdges, type RawRelNote } from '../cli-relations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(basename: string, connectionsBody: string): RawRelNote {
  return {
    basename,
    body: `## Summary\n\n## Content\n\n## Connections\n${connectionsBody}\n## Flags\n`,
  };
}

// ---------------------------------------------------------------------------
// Edge extraction
// ---------------------------------------------------------------------------

describe('extractEdges', () => {
  test('extracts typed edges from connection sections', () => {
    const notes = [
      makeNote('note-a', '- depends-on :: [[note-b]]\n- implements :: [[note-c]]'),
      makeNote('note-b', '- depends-on :: [[note-c]] — load balancing'),
    ];
    const result = extractEdges(notes, new Set());
    expect(result.edges).toHaveLength(3);
    expect(result.edges[0]).toMatchObject({
      source: 'note-a',
      rel: 'depends-on',
      target: 'note-b',
    });
    expect(result.edges[1]).toMatchObject({
      source: 'note-a',
      rel: 'implements',
      target: 'note-c',
    });
  });

  test('captures context strings from connection lines', () => {
    const notes = [makeNote('note-a', '- depends-on :: [[note-b]] — load balancing dependency')];
    const result = extractEdges(notes, new Set());
    expect(result.edges[0].context).toBe('load balancing dependency');
  });

  test('does not extract untyped connections as edges', () => {
    const notes = [makeNote('note-a', '- [[note-b]]')];
    const result = extractEdges(notes, new Set());
    expect(result.edges).toHaveLength(0);
  });

  test('builds summary sorted descending by count', () => {
    const notes = [
      makeNote(
        'note-a',
        '- depends-on :: [[note-b]]\n- depends-on :: [[note-c]]\n- implements :: [[note-d]]'
      ),
    ];
    const result = extractEdges(notes, new Set());
    const keys = Object.keys(result.summary);
    expect(keys[0]).toBe('depends-on');
    expect(result.summary['depends-on']).toBe(2);
    expect(result.summary['implements']).toBe(1);
  });

  test('detects unknown relationship types when ontology is provided', () => {
    const notes = [makeNote('note-a', '- mystery-rel :: [[note-b]]\n- depends-on :: [[note-c]]')];
    const validTypes = new Set(['depends-on', 'implements']);
    const result = extractEdges(notes, validTypes);
    expect(result.unknownTypes).toContain('mystery-rel');
    expect(result.unknownTypes).not.toContain('depends-on');
  });

  test('does not flag unknown types when no ontology is loaded', () => {
    const notes = [makeNote('note-a', '- mystery-rel :: [[note-b]]')];
    const result = extractEdges(notes, new Set()); // empty = no ontology
    expect(result.unknownTypes).toHaveLength(0);
  });

  test('returns empty edges for notes with no connections section', () => {
    const notes = [{ basename: 'note-a', body: '## Summary\nno connections here\n' }];
    const result = extractEdges(notes, new Set());
    expect(result.edges).toHaveLength(0);
  });

  test('JSON schema contains edges, summary, and unknownTypes keys', () => {
    const result = extractEdges([], new Set());
    expect(result).toHaveProperty('edges');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('unknownTypes');
    expect(Array.isArray(result.edges)).toBe(true);
    expect(Array.isArray(result.unknownTypes)).toBe(true);
  });
});
