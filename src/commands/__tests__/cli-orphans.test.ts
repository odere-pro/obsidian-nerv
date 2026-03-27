// STORY-034 — cli-orphans unit tests
// Tests ORPHAN, BROKEN, MISMATCH detection with mock vault data.

import { describe, expect, test } from 'bun:test';
import { detectOrphans, type OrphanNoteData } from '../cli-orphans';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<OrphanNoteData> = {}): OrphanNoteData {
  return {
    path: 'projects/test/TEST.leaf - Leaf.md',
    basename: 'TEST.leaf - Leaf',
    type: 'LEAF',
    parent: '[[TEST.root - Root]]',
    resolvedParentPath: 'projects/test/TEST.root - Root.md',
    parentChildrenBasenames: ['TEST.leaf - Leaf'],
    childrenBasenames: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ORPHAN: BRANCH/LEAF with no parent field
// ---------------------------------------------------------------------------

describe('ORPHAN detection', () => {
  test('fires for LEAF with empty parent', () => {
    const issues = detectOrphans([makeNote({ parent: '' })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('ORPHAN');
  });

  test('fires for BRANCH with empty parent', () => {
    const issues = detectOrphans([
      makeNote({ type: 'BRANCH', parent: '', resolvedParentPath: null }),
    ]);
    expect(issues.some(i => i.type === 'ORPHAN')).toBe(true);
  });

  test('does not fire for ROOT (ROOT has no parent by design)', () => {
    const issues = detectOrphans([
      makeNote({ type: 'ROOT', parent: '', resolvedParentPath: null }),
    ]);
    expect(issues.filter(i => i.type === 'ORPHAN')).toHaveLength(0);
  });

  test('does not fire when LEAF has a parent', () => {
    const issues = detectOrphans([makeNote()]);
    expect(issues.filter(i => i.type === 'ORPHAN')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BROKEN: parent wikilink resolves to no file
// ---------------------------------------------------------------------------

describe('BROKEN detection', () => {
  test('fires when parent wikilink is unresolvable', () => {
    const note = makeNote({ resolvedParentPath: null });
    const issues = detectOrphans([note]);
    expect(issues.some(i => i.type === 'BROKEN')).toBe(true);
  });

  test('does not fire when parent resolves correctly', () => {
    const issues = detectOrphans([makeNote()]);
    expect(issues.filter(i => i.type === 'BROKEN')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MISMATCH: parent exists but does not list this note in children
// ---------------------------------------------------------------------------

describe('MISMATCH detection', () => {
  test('fires when parent does not list this note in children', () => {
    const note = makeNote({ parentChildrenBasenames: ['TEST.other - Other'] });
    const issues = detectOrphans([note]);
    expect(issues.some(i => i.type === 'MISMATCH')).toBe(true);
  });

  test('does not fire when parent lists this note correctly', () => {
    const issues = detectOrphans([makeNote()]);
    expect(issues.filter(i => i.type === 'MISMATCH')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CHILD: parent lists a child that doesn't exist
// ---------------------------------------------------------------------------

describe('CHILD detection', () => {
  test('fires when a child wikilink is unresolvable', () => {
    const note = makeNote({
      type: 'ROOT',
      parent: '',
      resolvedParentPath: null,
      childrenBasenames: [null],
    });
    const issues = detectOrphans([note]);
    expect(issues.some(i => i.type === 'CHILD')).toBe(true);
  });

  test('does not fire when all children resolve', () => {
    const note = makeNote({ type: 'BRANCH', childrenBasenames: ['TEST.child - Child'] });
    const issues = detectOrphans([note]);
    expect(issues.filter(i => i.type === 'CHILD')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Clean note produces no issues
// ---------------------------------------------------------------------------

describe('clean note produces no orphan issues', () => {
  test('all zero issues for a valid note', () => {
    expect(detectOrphans([makeNote()])).toHaveLength(0);
  });
});
