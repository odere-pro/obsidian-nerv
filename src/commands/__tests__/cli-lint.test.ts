// STORY-034 — cli-lint unit tests
// Tests each of the 11 violation rules as pure functions with mock NoteData.
// No Obsidian or obEval required.

import { describe, expect, test } from 'bun:test';
import {
  VIOLATION_RULES,
  parseConnections,
  extractSection,
  type NoteData,
  type ConnectionLine,
} from '../cli-lint.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<NoteData> = {}): NoteData {
  return {
    path: 'projects/test/TEST.note - Note.md',
    frontmatter: {
      title: 'Note',
      type: 'LEAF',
      kind: 'concept',
      spine: 'test',
      status: 'draft',
      created: '2026-01-01',
      aliases: [],
      parent: '[[TEST.root - Root]]',
      children: [],
    },
    body: '## Breadcrumb\n\n## Summary\n\n## Content\n\n## Connections\n\n## Flags\n',
    connections: [],
    backlinks: [],
    ...overrides,
  };
}

function ruleFor(ruleName: string): (note: NoteData) => ReturnType<(typeof VIOLATION_RULES)[0]> {
  return (note: NoteData) => {
    for (const r of VIOLATION_RULES) {
      const v = r(note);
      if (v && v.rule === ruleName) return v;
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// extractSection
// ---------------------------------------------------------------------------

describe('extractSection', () => {
  test('extracts a named section body', () => {
    const body = '## Connections\n- depends-on :: [[foo]]\n\n## Flags\n';
    const result = extractSection(body, 'Connections');
    expect(result).toContain('depends-on :: [[foo]]');
    expect(result).not.toContain('## Flags');
  });

  test('returns empty string for missing section', () => {
    expect(extractSection('## Summary\nsome text\n', 'Connections')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseConnections
// ---------------------------------------------------------------------------

describe('parseConnections', () => {
  test('parses typed connection lines', () => {
    const body =
      '## Connections\n- depends-on :: [[note-a]]\n- implements :: [[note-b]] — for testing\n';
    const conns = parseConnections(body);
    expect(conns).toHaveLength(2);
    expect(conns[0]).toMatchObject({ rel: 'depends-on', target: 'note-a', typed: true });
    expect(conns[1]).toMatchObject({
      rel: 'implements',
      target: 'note-b',
      context: 'for testing',
      typed: true,
    });
  });

  test('parses untyped connection lines', () => {
    const body = '## Connections\n- [[some-note]]\n';
    const conns = parseConnections(body);
    expect(conns).toHaveLength(1);
    expect(conns[0].typed).toBe(false);
  });

  test('returns empty array for empty connections section', () => {
    const body = '## Connections\n\n## Flags\n';
    expect(parseConnections(body)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule: missing-field
// ---------------------------------------------------------------------------

describe('rule: missing-field', () => {
  const check = ruleFor('missing-field');

  test('fires when a required field is missing', () => {
    const note = makeNote({
      frontmatter: {
        title: 'X',
        type: 'LEAF',
        spine: 'test',
        status: 'draft',
        created: '2026-01-01',
        aliases: [],
      },
    }); // missing 'kind'
    expect(check(note)).not.toBeNull();
    expect(check(note)?.rule).toBe('missing-field');
  });

  test('does not fire for a complete note', () => {
    expect(check(makeNote())).toBeNull();
  });

  test('fires when a field is empty string', () => {
    const note = makeNote({ frontmatter: { ...makeNote().frontmatter, kind: '' } });
    expect(check(note)?.rule).toBe('missing-field');
  });
});

// ---------------------------------------------------------------------------
// Rule: root-has-parent
// ---------------------------------------------------------------------------

describe('rule: root-has-parent', () => {
  const check = ruleFor('root-has-parent');

  test('fires when ROOT note has a parent', () => {
    const note = makeNote({
      frontmatter: { ...makeNote().frontmatter, type: 'ROOT', parent: '[[some-parent]]' },
    });
    expect(check(note)?.rule).toBe('root-has-parent');
  });

  test('does not fire for ROOT without parent', () => {
    const note = makeNote({ frontmatter: { ...makeNote().frontmatter, type: 'ROOT', parent: '' } });
    expect(check(note)).toBeNull();
  });

  test('does not fire for non-ROOT note with parent', () => {
    expect(check(makeNote())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule: missing-parent
// ---------------------------------------------------------------------------

describe('rule: missing-parent', () => {
  const check = ruleFor('missing-parent');

  test('fires when LEAF has no parent', () => {
    const note = makeNote({ frontmatter: { ...makeNote().frontmatter, parent: '' } });
    expect(check(note)?.rule).toBe('missing-parent');
  });

  test('fires when BRANCH has no parent', () => {
    const note = makeNote({
      frontmatter: {
        ...makeNote().frontmatter,
        type: 'BRANCH',
        parent: '',
        children: ['[[child]]'],
      },
    });
    expect(check(note)?.rule).toBe('missing-parent');
  });

  test('does not fire when parent is set', () => {
    expect(check(makeNote())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule: empty-children
// ---------------------------------------------------------------------------

describe('rule: empty-children', () => {
  const check = ruleFor('empty-children');

  test('fires when BRANCH has no children', () => {
    const note = makeNote({
      frontmatter: { ...makeNote().frontmatter, type: 'BRANCH', children: [] },
    });
    expect(check(note)?.rule).toBe('empty-children');
  });

  test('does not fire when BRANCH has children', () => {
    const note = makeNote({
      frontmatter: { ...makeNote().frontmatter, type: 'BRANCH', children: ['[[child]]'] },
    });
    expect(check(note)).toBeNull();
  });

  test('does not fire for LEAF with empty children', () => {
    expect(check(makeNote())).toBeNull(); // LEAF, children: []
  });
});

// ---------------------------------------------------------------------------
// Rule: spine-in-body
// ---------------------------------------------------------------------------

describe('rule: spine-in-body', () => {
  const check = ruleFor('spine-in-body');

  test('fires when spine tag appears in body text', () => {
    const note = makeNote({ body: '## Summary\nTagged with #test for testing.\n## Connections\n' });
    expect(check(note)?.rule).toBe('spine-in-body');
  });

  test('does not fire when body has no spine tag', () => {
    expect(check(makeNote())).toBeNull();
  });

  test('fires when spine tag appears at end of body', () => {
    const note = makeNote({ body: '## Summary\nSome text #test' });
    expect(check(note)?.rule).toBe('spine-in-body');
  });
});

// ---------------------------------------------------------------------------
// Rule: legacy-flag-tag
// ---------------------------------------------------------------------------

describe('rule: legacy-flag-tag', () => {
  const check = ruleFor('legacy-flag-tag');

  test('fires when body contains #flag/', () => {
    const note = makeNote({ body: '## Summary\nSee #flag/urgent for this.\n' });
    expect(check(note)?.rule).toBe('legacy-flag-tag');
  });

  test('does not fire for clean body', () => {
    expect(check(makeNote())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule: legacy-status-tag
// ---------------------------------------------------------------------------

describe('rule: legacy-status-tag', () => {
  const check = ruleFor('legacy-status-tag');

  test('fires when body contains #status/', () => {
    const note = makeNote({ body: '## Summary\nMarked as #status/review.\n' });
    expect(check(note)?.rule).toBe('legacy-status-tag');
  });

  test('does not fire for clean body', () => {
    expect(check(makeNote())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule: untyped-connection
// ---------------------------------------------------------------------------

describe('rule: untyped-connection', () => {
  const check = ruleFor('untyped-connection');

  test('fires when connections include an untyped link', () => {
    const conns: ConnectionLine[] = [
      { rel: '', target: '', context: '- [[some-note]]', typed: false },
    ];
    const note = makeNote({ connections: conns });
    expect(check(note)?.rule).toBe('untyped-connection');
  });

  test('does not fire when all connections are typed', () => {
    const conns: ConnectionLine[] = [
      { rel: 'depends-on', target: 'note-a', context: '', typed: true },
    ];
    expect(check(makeNote({ connections: conns }))).toBeNull();
  });

  test('does not fire when connections are empty', () => {
    expect(check(makeNote())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule: connection-limit
// ---------------------------------------------------------------------------

describe('rule: connection-limit', () => {
  const check = ruleFor('connection-limit');

  function makeTyped(n: number): ConnectionLine[] {
    return Array.from({ length: n }, (_, i) => ({
      rel: 'depends-on',
      target: `note-${i}`,
      context: '',
      typed: true,
    }));
  }

  test('fires when typed connection count exceeds 7', () => {
    const note = makeNote({ connections: makeTyped(8) });
    expect(check(note)?.rule).toBe('connection-limit');
  });

  test('does not fire at exactly 7 connections', () => {
    expect(check(makeNote({ connections: makeTyped(7) }))).toBeNull();
  });

  test('does not fire for empty connections', () => {
    expect(check(makeNote())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule: missing-breadcrumb
// ---------------------------------------------------------------------------

describe('rule: missing-breadcrumb', () => {
  const check = ruleFor('missing-breadcrumb');

  test('fires when LEAF is missing ## Breadcrumb', () => {
    const note = makeNote({ body: '## Summary\n## Connections\n' });
    expect(check(note)?.rule).toBe('missing-breadcrumb');
  });

  test('fires when BRANCH is missing ## Breadcrumb', () => {
    const note = makeNote({
      frontmatter: { ...makeNote().frontmatter, type: 'BRANCH', children: ['[[child]]'] },
      body: '## Summary\n## Connections\n',
    });
    expect(check(note)?.rule).toBe('missing-breadcrumb');
  });

  test('does not fire when ## Breadcrumb is present', () => {
    expect(check(makeNote())).toBeNull();
  });

  test('does not fire for ROOT (no breadcrumb required)', () => {
    const note = makeNote({ frontmatter: { ...makeNote().frontmatter, type: 'ROOT', parent: '' } });
    expect(check(note)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rule: flag-limit
// ---------------------------------------------------------------------------

describe('rule: flag-limit', () => {
  const check = ruleFor('flag-limit');

  test('fires when callout flag count exceeds 3', () => {
    const body = '## Flags\n> [!flag] One\n> [!flag] Two\n> [!flag] Three\n> [!flag] Four\n';
    expect(check(makeNote({ body }))?.rule).toBe('flag-limit');
  });

  test('does not fire at exactly 3 flags', () => {
    const body = '## Flags\n> [!flag] One\n> [!flag] Two\n> [!flag] Three\n';
    expect(check(makeNote({ body }))).toBeNull();
  });

  test('does not fire for clean note', () => {
    expect(check(makeNote())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Exclusion logic: tpl-* and _ontology* files should be excluded by the caller
// (The rules operate on NoteData — exclusion happens at the fetch level.)
// We verify that a "clean" note produces 0 violations.
// ---------------------------------------------------------------------------

describe('clean note produces no violations', () => {
  test('all 11 rules return null for a valid note', () => {
    const note = makeNote();
    const violations = VIOLATION_RULES.map(r => r(note)).filter(Boolean);
    expect(violations).toHaveLength(0);
  });
});
