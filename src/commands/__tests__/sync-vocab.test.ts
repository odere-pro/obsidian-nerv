// STORY-034 — sync-vocab unit tests
// Tests spine extraction and table generation from mock notes.

import { describe, expect, test } from 'bun:test';
import { buildVocabContent, type VocabNote } from '../sync-vocab.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<VocabNote> = {}): VocabNote {
  return {
    basename: 'TEST.note - Note',
    type: 'LEAF',
    spine: 'test',
    status: 'draft',
    childrenCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildVocabContent
// ---------------------------------------------------------------------------

describe('buildVocabContent', () => {
  test('generates vocab file header with slug', () => {
    const content = buildVocabContent([], 'myproject');
    expect(content).toContain('# Vocabulary — myproject');
  });

  test('groups notes by spine with ## heading', () => {
    const notes = [
      makeNote({ basename: 'P.a - A', spine: 'alpha' }),
      makeNote({ basename: 'P.b - B', spine: 'beta' }),
    ];
    const content = buildVocabContent(notes, 'p');
    expect(content).toContain('## alpha');
    expect(content).toContain('## beta');
  });

  test('lists notes under their spine as wikilinks', () => {
    const notes = [
      makeNote({ basename: 'TEST.note - Note', spine: 'test', type: 'LEAF', status: 'draft' }),
    ];
    const content = buildVocabContent(notes, 'test');
    expect(content).toContain('[[TEST.note - Note]] (LEAF, draft)');
  });

  test('sorts entries: spine asc, then ROOT/BRANCH/LEAF order, then basename asc', () => {
    const notes = [
      makeNote({ basename: 'P.leaf - Leaf', type: 'LEAF', spine: 'alpha' }),
      makeNote({ basename: 'P.root - Root', type: 'ROOT', spine: 'alpha' }),
      makeNote({ basename: 'P.branch - Branch', type: 'BRANCH', spine: 'alpha', childrenCount: 1 }),
    ];
    const content = buildVocabContent(notes, 'p');
    const rootPos = content.indexOf('P.root');
    const branchPos = content.indexOf('P.branch');
    const leafPos = content.indexOf('P.leaf');
    expect(rootPos).toBeLessThan(branchPos);
    expect(branchPos).toBeLessThan(leafPos);
  });

  test('appends ## Orphan Terms section for notes without spine', () => {
    const notes = [makeNote({ spine: '' })];
    const content = buildVocabContent(notes, 'test');
    expect(content).toContain('## Orphan Terms');
    expect(content).toContain('[[TEST.note - Note]]');
  });

  test('adds overflow warning for BRANCH with > 7 children', () => {
    const notes = [makeNote({ type: 'BRANCH', childrenCount: 8, spine: 'test' })];
    const content = buildVocabContent(notes, 'test');
    expect(content).toContain('⚠ overflow (children: 8)');
  });

  test('does not add overflow warning at exactly 7 children for BRANCH', () => {
    const notes = [makeNote({ type: 'BRANCH', childrenCount: 7, spine: 'test' })];
    const content = buildVocabContent(notes, 'test');
    expect(content).not.toContain('⚠ overflow');
  });

  test('handles empty note list gracefully', () => {
    const content = buildVocabContent([], 'empty');
    expect(content).toContain('# Vocabulary — empty');
    expect(content).not.toContain('## Orphan Terms');
  });
});
