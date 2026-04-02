// Ports assertions from cli/core/tests/test-cli-relations.sh.
// Creates a test project with notes containing typed connections,
// verifies edge extraction, JSON schema, unknown type detection,
// summary sorting, context capture, and exclusion rules.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getRelations } from '../../../src/commands/cli-relations';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';
const TEST_SLUG = 'testrel-ts';
const TEST_DIR = `projects/${TEST_SLUG}`;
const TEST_UPPER = 'TESTREL-TS';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createNote(path: string, content: string): Promise<void> {
  const jsPath = encodeForJs(path);
  const jsContent = encodeForJs(content);
  const jsProjDir = encodeForJs(TEST_DIR);
  await obEval(
    VAULT_NAME,
    `(async () => {
  const dir = ${jsProjDir};
  const folder = app.vault.getAbstractFileByPath(dir);
  if (!folder) await app.vault.createFolder(dir);
  await app.vault.create(${jsPath}, ${jsContent});
})()`
  );
}

async function cleanup(): Promise<void> {
  const jsDir = encodeForJs(TEST_DIR);
  await obEval(
    VAULT_NAME,
    `(async () => {
  const f = app.vault.getAbstractFileByPath(${jsDir});
  if (f) await app.vault.trash(f, false);
})()`
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await cleanup();

  // Note A: two known connections + one unknown type
  await createNote(
    `${TEST_DIR}/${TEST_UPPER}.note-a - Note A.md`,
    `---
title: "Note A"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: ""
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

## Content

## Connections

- depends-on :: [[${TEST_UPPER}.note-b - Note B]]
- implements :: [[${TEST_UPPER}.note-c - Note C]]
- mystery-rel :: [[${TEST_UPPER}.note-c - Note C]]

## Flags
`
  );

  // Note B: one known connection with context
  await createNote(
    `${TEST_DIR}/${TEST_UPPER}.note-b - Note B.md`,
    `---
title: "Note B"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: ""
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

## Content

## Connections

- depends-on :: [[${TEST_UPPER}.note-c - Note C]] — load balancing dependency

## Flags
`
  );

  // Note C: no connections
  await createNote(
    `${TEST_DIR}/${TEST_UPPER}.note-c - Note C.md`,
    `---
title: "Note C"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: ""
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

## Content

## Connections

## Flags
`
  );

  // Ontology file with known types (depends-on, implements)
  await createNote(
    `${TEST_DIR}/_ontology.${TEST_SLUG}.md`,
    `---
type: ONTOLOGY
updated: 2026-01-01
---

## Relationship Types

| Type | Inverse |
|------|---------|
| \`depends-on\` | \`depends-on\` |
| \`implements\` | \`extends\` |
`
  );
});

afterAll(async () => {
  if (process.env.NERV_SKIP_CLEANUP === '1') return;
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cli-relations integration', () => {
  test('getRelations returns a valid RelationResult structure', async () => {
    const result = await getRelations(VAULT_NAME, TEST_SLUG);
    expect(result).toHaveProperty('project');
    expect(result).toHaveProperty('edges');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('unknownTypes');
    expect(Array.isArray(result.edges)).toBe(true);
    expect(Array.isArray(result.unknownTypes)).toBe(true);
  });

  test('extracts edges with correct source, rel, target fields', async () => {
    const result = await getRelations(VAULT_NAME, TEST_SLUG);
    const rels = result.edges.map(e => e.rel);
    expect(rels).toContain('depends-on');
    expect(rels).toContain('implements');
    expect(rels).toContain('mystery-rel');
  });

  test('detects unknown relationship type mystery-rel', async () => {
    const result = await getRelations(VAULT_NAME, TEST_SLUG);
    expect(result.unknownTypes).toContain('mystery-rel');
  });

  test('does not flag known types as unknown', async () => {
    const result = await getRelations(VAULT_NAME, TEST_SLUG);
    expect(result.unknownTypes).not.toContain('depends-on');
    expect(result.unknownTypes).not.toContain('implements');
  });

  test('summary is sorted descending by count', async () => {
    const result = await getRelations(VAULT_NAME, TEST_SLUG);
    const keys = Object.keys(result.summary);
    expect(keys.length).toBeGreaterThan(0);
    // depends-on appears twice (note-a→b, note-b→c), implements once
    expect(result.summary['depends-on']).toBe(2);
    expect(result.summary['implements']).toBe(1);
    // First key should be depends-on (highest count)
    expect(keys[0]).toBe('depends-on');
  });

  test('captures context strings from connection lines', async () => {
    const result = await getRelations(VAULT_NAME, TEST_SLUG);
    const contextEdge = result.edges.find(e => e.context === 'load balancing dependency');
    expect(contextEdge).toBeDefined();
  });

  test('excluded file types are not in edge sources', async () => {
    const result = await getRelations(VAULT_NAME, TEST_SLUG);
    const sources = result.edges.map(e => e.source);
    for (const prefix of ['_ontology', '_vocab', '_topk', 'tpl-']) {
      const excluded = sources.filter(s => s.startsWith(prefix));
      expect(excluded).toHaveLength(0);
    }
  });

  test('returns 0 edges for a non-existent scope gracefully', async () => {
    const result = await getRelations(VAULT_NAME, 'nonexistent-xyz-proj');
    expect(result.edges).toHaveLength(0);
  });
});
