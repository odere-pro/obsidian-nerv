// STORY-035 — context unit tests
// Tests scoreNote as a pure function with mock ScoringNote data.
// No Obsidian or obEval required.

import { describe, expect, test } from 'bun:test';
import { scoreNote, type ScoringNote } from '../context';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<ScoringNote> = {}): ScoringNote {
  return {
    basename: 'test-note',
    frontmatter: {
      title: 'Test Note',
      kind: 'concept',
      spine: 'testing',
      aliases: [],
      tags: [],
    },
    rawBody: '---\ntitle: Test Note\n---\n\n## Summary\n\nA short body.\n',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Individual scoring dimensions
// ---------------------------------------------------------------------------

describe('scoreNote — title match (+10)', () => {
  test('scores +10 when query term appears in title', () => {
    const note = makeNote({
      frontmatter: { title: 'machine learning', kind: '', spine: '', aliases: [], tags: [] },
    });
    expect(scoreNote('machine', note)).toBe(10);
  });

  test('is case-insensitive', () => {
    const note = makeNote({
      frontmatter: { title: 'Machine Learning', kind: '', spine: '', aliases: [], tags: [] },
    });
    expect(scoreNote('MACHINE', note)).toBe(10);
  });

  test('does not score when query absent from title', () => {
    const note = makeNote({
      frontmatter: { title: 'unrelated topic', kind: '', spine: '', aliases: [], tags: [] },
    });
    expect(scoreNote('machine', note)).toBe(0);
  });
});

describe('scoreNote — alias match (+8)', () => {
  test('scores +8 when query term appears in an alias', () => {
    const note = makeNote({
      frontmatter: { title: 'unrelated', kind: '', spine: '', aliases: ['ml concept'], tags: [] },
    });
    expect(scoreNote('ml', note)).toBe(8);
  });

  test('scores +8 using singular alias field', () => {
    const note = makeNote({
      frontmatter: { title: 'unrelated', kind: '', spine: '', alias: 'ml concept', tags: [] },
    });
    expect(scoreNote('ml', note)).toBe(8);
  });
});

describe('scoreNote — kind match (+5)', () => {
  test('scores +5 when query term appears in kind', () => {
    const note = makeNote({
      frontmatter: { title: 'X', kind: 'algorithm', spine: '', aliases: [], tags: [] },
    });
    expect(scoreNote('algorithm', note)).toBe(5);
  });
});

describe('scoreNote — spine match (+4)', () => {
  test('scores +4 when query term appears in spine', () => {
    const note = makeNote({
      frontmatter: { title: 'X', kind: '', spine: 'neural-networks', aliases: [], tags: [] },
    });
    expect(scoreNote('neural', note)).toBe(4);
  });
});

describe('scoreNote — tag match (+3)', () => {
  test('scores +3 when query term appears in a tag', () => {
    const note = makeNote({
      frontmatter: {
        title: 'X',
        kind: '',
        spine: '',
        aliases: [],
        tags: ['deep-learning', 'pytorch'],
      },
    });
    expect(scoreNote('deep', note)).toBe(3);
  });

  test('scores +3 using singular tag field', () => {
    const note = makeNote({
      frontmatter: { title: 'X', kind: '', spine: '', aliases: [], tag: 'deep-learning' },
    });
    expect(scoreNote('deep', note)).toBe(3);
  });
});

describe('scoreNote — body term frequency (+1 per occurrence, capped at +5)', () => {
  test('scores +1 per body occurrence', () => {
    const note = makeNote({
      frontmatter: { title: 'X', kind: '', spine: '', aliases: [], tags: [] },
      rawBody: 'gradient gradient gradient',
    });
    expect(scoreNote('gradient', note)).toBe(3);
  });

  test('caps body score at +5 regardless of frequency', () => {
    const note = makeNote({
      frontmatter: { title: 'X', kind: '', spine: '', aliases: [], tags: [] },
      rawBody: 'word word word word word word word word word word', // 10 occurrences
    });
    expect(scoreNote('word', note)).toBe(5);
  });

  test('scores body over raw body (including frontmatter block)', () => {
    const note = makeNote({
      frontmatter: { title: 'X', kind: '', spine: '', aliases: [], tags: [] },
      rawBody: '---\ntitle: X\n---\ntoken token token',
    });
    // 2 in body (after ---) + 1 in title in frontmatter block (raw)
    // rawBody includes the frontmatter block, so "token" appears 3 times total
    const s = scoreNote('token', note);
    expect(s).toBeGreaterThanOrEqual(3);
    expect(s).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Combined scoring
// ---------------------------------------------------------------------------

describe('scoreNote — combined scoring', () => {
  test('accumulates scores across multiple dimensions', () => {
    const note = makeNote({
      frontmatter: {
        title: 'neural network', // +10 for 'neural'
        kind: 'algorithm',
        spine: 'neural-systems', // +4 for 'neural'
        aliases: [],
        tags: ['neural-nets'], // +3 for 'neural'
      },
      rawBody: 'neural neural', // +2 for 'neural'
    });
    // 'neural': title(+10) + spine(+4) + tag(+3) + body(+2) = 19
    expect(scoreNote('neural', note)).toBe(19);
  });

  test('multi-term query accumulates across terms', () => {
    const note = makeNote({
      frontmatter: {
        title: 'gradient descent', // +10 for 'gradient', +10 for 'descent'
        kind: '',
        spine: '',
        aliases: [],
        tags: [],
      },
      rawBody: '---\n---\n',
    });
    expect(scoreNote('gradient descent', note)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Zero-score exclusion
// ---------------------------------------------------------------------------

describe('scoreNote — zero-score exclusion', () => {
  test('returns 0 when query does not match anything', () => {
    const note = makeNote({
      frontmatter: {
        title: 'completely different',
        kind: 'concept',
        spine: 'other',
        aliases: [],
        tags: [],
      },
      rawBody: '---\n---\nno relevant terms here',
    });
    expect(scoreNote('zzz_nomatch', note)).toBe(0);
  });

  test('returns 0 for empty query', () => {
    expect(scoreNote('', makeNote())).toBe(0);
  });

  test('returns 0 for whitespace-only query', () => {
    expect(scoreNote('   ', makeNote())).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Punctuation stripping in query normalization
// ---------------------------------------------------------------------------

describe('scoreNote — query normalization', () => {
  test('strips punctuation from query terms before scoring', () => {
    const note = makeNote({
      frontmatter: { title: 'machine learning', kind: '', spine: '', aliases: [], tags: [] },
    });
    // "machine," should normalize to "machine"
    expect(scoreNote('machine,', note)).toBe(10);
  });
});
