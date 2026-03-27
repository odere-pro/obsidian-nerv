// STORY-035 — get-entity integration tests
// Ports assertions from cli/core/tests/test-get-entity.sh.
// Requires: OBSIDIAN_RUNNING=1 environment variable.
//
// Creates a small two-note project in the vault, exercises all match levels,
// verifies JSON output schema, sections, backlinks, and outgoing links,
// then cleans up.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getEntity } from '../../../src/commands/get-entity';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT = process.env.TEST_VAULT ?? 'study';
const RUNNING = process.env.OBSIDIAN_RUNNING === '1';

const TEST_SLUG = 'testge-ts';
const TEST_TITLE = 'Test GetEntity TS';
const TEST_PROJ = `projects/${TEST_SLUG}`;
const TEST_UPPER = 'TESTGE_TS';

const NOTE_A_BASENAME = `${TEST_UPPER}.alpha-concept - Alpha Concept`;
const NOTE_A_PATH = `${TEST_PROJ}/${NOTE_A_BASENAME}.md`;

const NOTE_B_BASENAME = `${TEST_UPPER}.beta-concept - Beta Concept`;
const NOTE_B_PATH = `${TEST_PROJ}/${NOTE_B_BASENAME}.md`;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

async function createNote(path: string, content: string): Promise<void> {
  const jsPath = encodeForJs(path);
  const jsContent = encodeForJs(content);
  const jsDir = encodeForJs(TEST_PROJ);
  await obEval(
    VAULT,
    `(async () => {
  const dir = ${jsDir};
  const folder = app.vault.getAbstractFileByPath(dir);
  if (!folder) await app.vault.createFolder(dir);
  const existing = app.vault.getAbstractFileByPath(${jsPath});
  if (!existing) await app.vault.create(${jsPath}, ${jsContent});
})()`
  );
}

async function cleanup(): Promise<void> {
  const jsDir = encodeForJs(TEST_PROJ);
  await obEval(
    VAULT,
    `(async () => {
  const f = app.vault.getAbstractFileByPath(${jsDir});
  if (f) await app.vault.trash(f, false);
})()`
  ).catch(() => undefined);
}

// Bun doesn't have a built-in sleep — use this for metadataCache settle time
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

beforeAll(async () => {
  if (!RUNNING) return;
  await cleanup();

  // Note A: alpha-concept — has aliases, Summary/Content/Connections sections, links to Note B
  await createNote(
    NOTE_A_PATH,
    `---
title: Alpha Concept
aliases:
  - Alpha
  - alpha-alias
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: "[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
tags:
  - alpha
---

## Summary
This is the summary of Alpha Concept.
## Content
Alpha Concept covers foundational ideas about alpha-level thinking.
It references Beta Concept for comparison purposes.
## Connections
- related-to :: [[${NOTE_B_BASENAME}]]
## Flags
`
  );

  // Note B: beta-concept — linked to by Note A (backlinks test)
  await createNote(
    NOTE_B_PATH,
    `---
title: Beta Concept
aliases: []
type: LEAF
kind: reference
spine: ${TEST_SLUG}
status: draft
parent: "[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Summary
Beta Concept is a reference note.
## Content
Beta Concept provides supplementary material.
## Connections
## Flags
`
  );

  // Allow metadataCache to settle
  await sleep(1200);
});

afterAll(async () => {
  if (!RUNNING) return;
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('get-entity integration', () => {
  test.skipIf(!RUNNING)('exact basename match returns valid output', async () => {
    const result = await getEntity(VAULT, NOTE_A_BASENAME);
    expect(result).not.toBeNull();
    expect(typeof result?.path).toBe('string');
    expect(typeof result?.matchType).toBe('string');
    expect(typeof result?.frontmatter).toBe('object');
    expect(typeof result?.sections).toBe('object');
    expect(Array.isArray(result?.backlinks)).toBe(true);
    expect(Array.isArray(result?.outgoing)).toBe(true);
  });

  test.skipIf(!RUNNING)('matchType is "exact" for full basename', async () => {
    const result = await getEntity(VAULT, NOTE_A_BASENAME);
    expect(result?.matchType).toBe('exact');
  });

  test.skipIf(!RUNNING)('path matches expected note path', async () => {
    const result = await getEntity(VAULT, NOTE_A_BASENAME);
    expect(result?.path).toBe(NOTE_A_PATH);
  });

  test.skipIf(!RUNNING)('frontmatter has required fields', async () => {
    const result = await getEntity(VAULT, NOTE_A_BASENAME);
    const fm = result?.frontmatter ?? {};
    for (const key of ['title', 'type', 'kind', 'spine', 'status']) {
      expect(fm[key]).toBeDefined();
    }
  });

  test.skipIf(!RUNNING)('sections parsed — Summary, Content, Connections present', async () => {
    const result = await getEntity(VAULT, NOTE_A_BASENAME);
    const sections = result?.sections ?? {};
    expect(sections['Summary']).toBeDefined();
    expect(sections['Content']).toBeDefined();
    expect(sections['Connections']).toBeDefined();
    expect((sections['Summary'] ?? '').length).toBeGreaterThan(0);
  });

  test.skipIf(!RUNNING)('outgoing links present with correct schema', async () => {
    const result = await getEntity(VAULT, NOTE_A_BASENAME);
    const outgoing = result?.outgoing ?? [];
    expect(outgoing.length).toBeGreaterThan(0);
    const first = outgoing[0];
    expect(typeof first.path).toBe('string');
    expect(typeof first.title).toBe('string');
    expect(typeof first.display).toBe('string');
  });

  test.skipIf(!RUNNING)('alias match resolves to correct note', async () => {
    const result = await getEntity(VAULT, 'alpha-alias');
    expect(result).not.toBeNull();
    expect(result?.path).toBe(NOTE_A_PATH);
    expect(result?.matchType).toBe('alias');
  });

  test.skipIf(!RUNNING)('slug match (normalized basename) resolves to correct note', async () => {
    const result = await getEntity(VAULT, 'alpha-concept');
    expect(result).not.toBeNull();
    // Should match at slug or fuzzy level (normalized basename matches)
    expect(['slug', 'fuzzy', 'title']).toContain(result?.matchType);
  });

  test.skipIf(!RUNNING)('Note B backlinks include Note A', async () => {
    const result = await getEntity(VAULT, NOTE_B_BASENAME);
    expect(result).not.toBeNull();
    const backlinks = result?.backlinks ?? [];
    const hasNoteA = backlinks.some(
      b => b.path === NOTE_A_PATH || b.path.includes('alpha-concept')
    );
    expect(hasNoteA).toBe(true);
  });

  test.skipIf(!RUNNING)('backlink entries have path, title, type, kind, spine fields', async () => {
    const result = await getEntity(VAULT, NOTE_B_BASENAME);
    const backlinks = result?.backlinks ?? [];
    for (const bl of backlinks) {
      expect(typeof bl.path).toBe('string');
      expect(typeof bl.title).toBe('string');
      expect(typeof bl.type).toBe('string');
      expect(typeof bl.kind).toBe('string');
      expect(typeof bl.spine).toBe('string');
    }
  });

  test.skipIf(!RUNNING)('missing entity returns null', async () => {
    const result = await getEntity(VAULT, 'zzzz_absolutely_no_match_xyzabc_9999');
    expect(result).toBeNull();
  });
});
