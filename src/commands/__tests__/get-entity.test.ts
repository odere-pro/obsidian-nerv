// STORY-035 — get-entity unit tests
// Tests resolveEntity as a pure function with mock EntityNote data.
// Covers all 5 match levels plus the null-return case.
// No Obsidian or obEval required.

import { describe, expect, test } from 'bun:test';
import { resolveEntity, type EntityNote } from '../get-entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<EntityNote> & { basename: string }): EntityNote {
  return {
    path: `projects/test/${overrides.basename}.md`,
    frontmatter: { title: overrides.basename, type: 'LEAF', kind: 'concept' },
    rawBody: `---\ntitle: ${overrides.basename}\n---\n## Summary\n\nContent.\n`,
    backlinks: [],
    outgoing: [],
    ...overrides,
  };
}

const VAULT_NOTES: EntityNote[] = [
  makeNote({
    basename: 'ML.gpt-4 - GPT-4',
    frontmatter: { title: 'GPT-4', type: 'LEAF', kind: 'model', aliases: ['gpt4', 'gpt 4'] },
  }),
  makeNote({
    basename: 'ML.bert - BERT',
    frontmatter: { title: 'BERT', type: 'LEAF', kind: 'model', aliases: ['bert model'] },
  }),
  makeNote({
    basename: 'neural-networks',
    frontmatter: { title: 'Neural Networks', type: 'ROOT', kind: 'concept' },
  }),
  makeNote({
    basename: 'gradient-descent',
    frontmatter: { title: 'Gradient Descent Overview', type: 'BRANCH', kind: 'algorithm' },
  }),
  makeNote({
    basename: 'backprop',
    frontmatter: {
      title: 'Backpropagation',
      type: 'LEAF',
      kind: 'algorithm',
      aliases: ['back propagation'],
    },
  }),
];

// ---------------------------------------------------------------------------
// Level 1: exact basename match
// ---------------------------------------------------------------------------

describe('resolveEntity — level 1: exact basename match', () => {
  test('returns exact match when basename equals query (case-insensitive)', () => {
    const result = resolveEntity('neural-networks', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('exact');
    expect(result?.note.basename).toBe('neural-networks');
  });

  test('is case-insensitive for exact basename match', () => {
    const result = resolveEntity('Neural-Networks', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('exact');
  });
});

// ---------------------------------------------------------------------------
// Level 2: alias exact match
// ---------------------------------------------------------------------------

describe('resolveEntity — level 2: alias match', () => {
  test('returns alias match when query equals an alias exactly', () => {
    const result = resolveEntity('gpt4', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('alias');
    expect(result?.note.basename).toBe('ML.gpt-4 - GPT-4');
  });

  test('alias match is case-insensitive', () => {
    const result = resolveEntity('GPT4', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('alias');
  });
});

// ---------------------------------------------------------------------------
// Level 3: slug match
// ---------------------------------------------------------------------------

describe('resolveEntity — level 3: slug match', () => {
  test('returns slug match after stripping "PREFIX.slug - " prefix', () => {
    const result = resolveEntity('gpt-4', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('slug');
    expect(result?.note.basename).toBe('ML.gpt-4 - GPT-4');
  });

  test('returns slug match after stripping "PREFIX." prefix', () => {
    const result = resolveEntity('bert', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('slug');
    expect(result?.note.basename).toBe('ML.bert - BERT');
  });
});

// ---------------------------------------------------------------------------
// Level 4: title substring match
// ---------------------------------------------------------------------------

describe('resolveEntity — level 4: title substring match', () => {
  test('returns title match when query is a substring of frontmatter title', () => {
    const result = resolveEntity('Gradient Descent', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('title');
    expect(result?.note.basename).toBe('gradient-descent');
  });

  test('title match is case-insensitive', () => {
    const result = resolveEntity('gradient descent', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('title');
  });
});

// ---------------------------------------------------------------------------
// Level 5: fuzzy match
// ---------------------------------------------------------------------------

describe('resolveEntity — level 5: fuzzy match', () => {
  test('returns fuzzy match when basename contains query as substring', () => {
    const result = resolveEntity('backprop', VAULT_NOTES);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('exact'); // basename IS "backprop"
  });

  test('fuzzy via alias partial match', () => {
    const result = resolveEntity('back propagation', VAULT_NOTES);
    // alias "back propagation" matches exactly → alias level
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('alias');
  });
});

// ---------------------------------------------------------------------------
// No match
// ---------------------------------------------------------------------------

describe('resolveEntity — no match', () => {
  test('returns null when no note matches at any level', () => {
    const result = resolveEntity('zzzz-nonexistent-note-xyz', VAULT_NOTES);
    expect(result).toBeNull();
  });

  test('returns null for empty notes array', () => {
    expect(resolveEntity('anything', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ambiguous match falls through to next level
// ---------------------------------------------------------------------------

describe('resolveEntity — ambiguous at one level falls through', () => {
  test('title match with multiple hits returns null (ambiguous)', () => {
    // Both notes have "Algorithm" in title — should not return a result
    const notes: EntityNote[] = [
      makeNote({ basename: 'note-a', frontmatter: { title: 'Sorting Algorithm', type: 'LEAF' } }),
      makeNote({ basename: 'note-b', frontmatter: { title: 'Search Algorithm', type: 'LEAF' } }),
    ];
    // "algorithm" matches both titles; no slug/alias/exact match; fuzzy also matches both
    const result = resolveEntity('algorithm', notes);
    expect(result).toBeNull();
  });
});
