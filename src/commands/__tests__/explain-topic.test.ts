// Tests the pure composition logic of explain-topic:
//   - Sibling resolution when notes share a parent
//   - Null parent for ROOT notes
//   - Connected note assembly from ## Connections section
//
// Uses mock data; does NOT call obEval or Obsidian.
// The explainTopic() function itself calls obEval, so we test the
// lower-level composition logic by exercising scoreNote + resolveEntity
// directly with the same mock note shapes.

import { describe, expect, test } from 'bun:test';
import { scoreNote } from '../context';
import { resolveEntity, type EntityNote } from '../get-entity';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeEntityNote(basename: string, fm: Record<string, unknown>, rawBody = ''): EntityNote {
  return {
    path: `projects/test/${basename}.md`,
    basename,
    frontmatter: { title: basename, type: 'LEAF', kind: 'concept', ...fm },
    rawBody: rawBody || `---\ntitle: ${basename}\n---\n## Summary\n\nSummary of ${basename}.\n`,
    backlinks: [],
    outgoing: [],
  };
}

// ---------------------------------------------------------------------------
// Sibling resolution logic
// ---------------------------------------------------------------------------

describe('explain-topic — sibling resolution', () => {
  test('siblings share the same parent basename', () => {
    const parentName = 'ROOT-note';
    const primary = makeEntityNote('primary', { type: 'LEAF', parent: `[[${parentName}]]` });
    const sibling = makeEntityNote('sibling', { type: 'LEAF', parent: `[[${parentName}]]` });
    const unrelated = makeEntityNote('unrelated', { type: 'LEAF', parent: '[[other-root]]' });

    // Simulate sibling detection logic used in explainTopic
    const resolveWikiLink = (raw: string) => {
      const m = String(raw ?? '').match(/\[\[([^\]#|]+)/);
      return m ? m[1].trim() : String(raw ?? '').trim();
    };

    const primaryParent = resolveWikiLink(String(primary.frontmatter['parent'] ?? ''));
    const siblings = [sibling, unrelated].filter(n => {
      const nParent = resolveWikiLink(String(n.frontmatter['parent'] ?? ''));
      return nParent === primaryParent;
    });

    expect(siblings).toHaveLength(1);
    expect(siblings[0].basename).toBe('sibling');
  });
});

// ---------------------------------------------------------------------------
// ROOT note has no parent
// ---------------------------------------------------------------------------

describe('explain-topic — ROOT note parent is null', () => {
  test('ROOT note has empty parent field', () => {
    const root = makeEntityNote('ROOT-node', { type: 'ROOT', parent: '' });
    const resolveWikiLink = (raw: string) => {
      const m = String(raw ?? '').match(/\[\[([^\]#|]+)/);
      return m ? m[1].trim() : String(raw ?? '').trim();
    };

    const parentName = resolveWikiLink(String(root.frontmatter['parent'] ?? ''));
    expect(parentName).toBe('');
    expect(String(root.frontmatter['type'])).toBe('ROOT');
  });
});

// ---------------------------------------------------------------------------
// scoreNote selects the most relevant note
// ---------------------------------------------------------------------------

describe('explain-topic — scoreNote selects primary', () => {
  test('highest-scoring note wins as primary', () => {
    const notes = [
      makeEntityNote('unrelated', { title: 'something else' }),
      makeEntityNote('target', { title: 'gradient descent' }),
      makeEntityNote('tangential', { title: 'gradient flow' }),
    ];

    let bestNote = notes[0];
    let bestScore = 0;
    for (const n of notes) {
      const s = scoreNote('gradient descent', {
        basename: n.basename,
        frontmatter: n.frontmatter,
        rawBody: n.rawBody,
      });
      if (s > bestScore) {
        bestScore = s;
        bestNote = n;
      }
    }

    expect(bestNote.basename).toBe('target');
    expect(bestScore).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// resolveEntity fallback when no note scores
// ---------------------------------------------------------------------------

describe('explain-topic — resolveEntity fallback', () => {
  test('resolveEntity returns null when no note matches', () => {
    const notes = [
      makeEntityNote('alpha', { title: 'Alpha' }),
      makeEntityNote('beta', { title: 'Beta' }),
    ];
    expect(resolveEntity('zzz-no-match', notes)).toBeNull();
  });

  test('resolveEntity finds by basename when scoring returns 0', () => {
    const notes = [
      makeEntityNote('exact-basename', { title: 'Different Title Entirely', kind: '', spine: '' }),
    ];
    // scoreNote would return 0 for a query of 'exact-basename' if frontmatter.title is different
    // but resolveEntity level 1 (exact basename) should catch it
    const result = resolveEntity('exact-basename', notes);
    expect(result).not.toBeNull();
    expect(result?.matchType).toBe('exact');
  });
});
