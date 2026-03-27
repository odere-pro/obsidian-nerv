// Tests detectGaps as a pure function with mock GapNote data.
// No Obsidian or obEval required.

import { describe, expect, test } from 'bun:test';
import { detectGaps, type GapNote } from '../get-knowledge-gap';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<GapNote> & { basename: string }): GapNote {
  return {
    type: 'LEAF',
    kind: 'concept',
    spine: 'test',
    status: 'published',
    frontmatter: {
      title: overrides.basename,
      type: 'LEAF',
      kind: 'concept',
      spine: 'test',
      status: 'published',
      created: '2026-01-01',
      aliases: [],
    },
    body: 'word '.repeat(120), // 120 words — above stub threshold
    typedConnections: 2,
    brokenLinks: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stubs (body word count < 100)
// ---------------------------------------------------------------------------

describe('detectGaps — stubs', () => {
  test('flags note with body word count < 100 as stub', () => {
    const note = makeNote({ basename: 'short-note', body: 'word '.repeat(50) });
    const result = detectGaps([note]);
    expect(result.stubs).toHaveLength(1);
    expect(result.stubs[0].note).toBe('short-note');
    expect(result.stubs[0].words).toBe(50);
  });

  test('does not flag note with exactly 100 words', () => {
    const note = makeNote({ basename: 'ok-note', body: 'word '.repeat(100) });
    const result = detectGaps([note]);
    expect(result.stubs).toHaveLength(0);
  });

  test('does not flag note with > 100 words', () => {
    const note = makeNote({ basename: 'full-note', body: 'word '.repeat(200) });
    const result = detectGaps([note]);
    expect(result.stubs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No typed connections
// ---------------------------------------------------------------------------

describe('detectGaps — noConnections', () => {
  test('flags note with zero typed connections', () => {
    const note = makeNote({ basename: 'isolated', typedConnections: 0 });
    const result = detectGaps([note]);
    expect(result.noConnections).toContain('isolated');
  });

  test('does not flag note with at least one typed connection', () => {
    const note = makeNote({ basename: 'connected', typedConnections: 1 });
    const result = detectGaps([note]);
    expect(result.noConnections).not.toContain('connected');
  });
});

// ---------------------------------------------------------------------------
// Low link count (ROOT or BRANCH with < 2 typed connections)
// ---------------------------------------------------------------------------

describe('detectGaps — lowLinkCount', () => {
  test('flags ROOT with fewer than 2 typed connections', () => {
    const note = makeNote({
      basename: 'sparse-root',
      type: 'ROOT',
      typedConnections: 1,
      frontmatter: {
        title: 'sparse-root',
        type: 'ROOT',
        kind: 'concept',
        spine: 'test',
        status: 'published',
        created: '2026-01-01',
        aliases: [],
      },
    });
    const result = detectGaps([note]);
    expect(result.lowLinkCount.some(e => e.note === 'sparse-root')).toBe(true);
  });

  test('flags BRANCH with fewer than 2 typed connections', () => {
    const note = makeNote({
      basename: 'sparse-branch',
      type: 'BRANCH',
      typedConnections: 0,
      frontmatter: {
        title: 'sparse-branch',
        type: 'BRANCH',
        kind: 'concept',
        spine: 'test',
        status: 'published',
        created: '2026-01-01',
        aliases: [],
      },
    });
    const result = detectGaps([note]);
    expect(result.lowLinkCount.some(e => e.note === 'sparse-branch')).toBe(true);
  });

  test('does not flag ROOT with 2+ connections', () => {
    const note = makeNote({
      basename: 'rich-root',
      type: 'ROOT',
      typedConnections: 3,
      frontmatter: {
        title: 'rich-root',
        type: 'ROOT',
        kind: 'concept',
        spine: 'test',
        status: 'published',
        created: '2026-01-01',
        aliases: [],
      },
    });
    const result = detectGaps([note]);
    expect(result.lowLinkCount.some(e => e.note === 'rich-root')).toBe(false);
  });

  test('does not flag LEAF for low link count', () => {
    const note = makeNote({ basename: 'leaf-zero', type: 'LEAF', typedConnections: 0 });
    const result = detectGaps([note]);
    expect(result.lowLinkCount.some(e => e.note === 'leaf-zero')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing required fields
// ---------------------------------------------------------------------------

describe('detectGaps — missingFields', () => {
  test('flags note missing a required field', () => {
    const note = makeNote({
      basename: 'no-kind',
      frontmatter: {
        title: 'no-kind',
        type: 'LEAF',
        spine: 'test',
        status: 'published',
        created: '2026-01-01',
        aliases: [],
      },
      // 'kind' is missing
    });
    const result = detectGaps([note]);
    const entry = result.missingFields.find(e => e.note === 'no-kind');
    expect(entry).not.toBeUndefined();
    expect(entry?.missing).toContain('kind');
  });

  test('does not flag note with all required fields present', () => {
    const note = makeNote({ basename: 'complete' });
    const result = detectGaps([note]);
    expect(result.missingFields.some(e => e.note === 'complete')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Draft status
// ---------------------------------------------------------------------------

describe('detectGaps — drafts', () => {
  test('flags note with status === draft', () => {
    const note = makeNote({
      basename: 'wip',
      status: 'draft',
      frontmatter: {
        title: 'wip',
        type: 'LEAF',
        kind: 'concept',
        spine: 'test',
        status: 'draft',
        created: '2026-01-01',
        aliases: [],
      },
    });
    const result = detectGaps([note]);
    expect(result.drafts.some(e => e.note === 'wip')).toBe(true);
  });

  test('does not flag published note', () => {
    const note = makeNote({ basename: 'done', status: 'published' });
    const result = detectGaps([note]);
    expect(result.drafts.some(e => e.note === 'done')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unresolved links
// ---------------------------------------------------------------------------

describe('detectGaps — unresolvedLinks', () => {
  test('flags note with broken wikilinks', () => {
    const note = makeNote({ basename: 'broken', brokenLinks: ['[[DeadRef]]'] });
    const result = detectGaps([note]);
    expect(result.unresolvedLinks.some(e => e.note === 'broken')).toBe(true);
    expect(result.unresolvedLinks[0].broken).toContain('[[DeadRef]]');
  });

  test('does not flag note with no broken links', () => {
    const note = makeNote({ basename: 'clean', brokenLinks: [] });
    const result = detectGaps([note]);
    expect(result.unresolvedLinks.some(e => e.note === 'clean')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe('detectGaps — empty input', () => {
  test('returns empty arrays for empty note list', () => {
    const result = detectGaps([]);
    expect(result.stubs).toHaveLength(0);
    expect(result.noConnections).toHaveLength(0);
    expect(result.drafts).toHaveLength(0);
    expect(result.missingFields).toHaveLength(0);
    expect(result.lowLinkCount).toHaveLength(0);
    expect(result.unresolvedLinks).toHaveLength(0);
  });
});
