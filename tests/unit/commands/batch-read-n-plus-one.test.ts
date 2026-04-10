/**
 * N+1 regression tests for batch-read commands.
 *
 * Ensures commands that read many files use a single readFiles() batch call
 * instead of N individual readFile() calls. Uses CallTracker from MockVaultOps
 * to assert call counts.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { MockVaultOps } from '../../../src/ports/mock-vault-ops';
import { lintProject } from '../../../src/commands/cli-lint';
import { getRelations } from '../../../src/commands/cli-relations';
import { syncTopk } from '../../../src/commands/sync-topk';

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

const VAULT = 'v';
const PROJECT = 'proj';
const PROJ_DIR = `projects/${PROJECT}`;

/**
 * Build a minimal entity note body with required sections.
 * Entity notes must have Breadcrumb, Summary, Content, Connections, Flags.
 */
function entityBody(connections: string[] = []): string {
  const connLines = connections.map(c => `- ${c}`).join('\n');
  return [
    '## Breadcrumb',
    '',
    '## Summary',
    '',
    'A test note.',
    '',
    '## Content',
    '',
    'Body text here.',
    '',
    '## Connections',
    connLines,
    '',
    '## Flags',
    '',
  ].join('\n');
}

function seedEntityNotes(ops: MockVaultOps, count: number): void {
  for (let i = 0; i < count; i++) {
    const slug = `leaf-${i}`;
    const basename = `PROJ.${slug} - Leaf ${i}`;
    const path = `${PROJ_DIR}/${basename}.md`;
    const fm: Record<string, unknown> = {
      title: `Leaf ${i}`,
      type: 'LEAF',
      kind: 'concept',
      spine: PROJECT,
      status: 'draft',
      created: '2026-01-01',
      aliases: [],
      parent: '[[PROJ.ROOT - Root]]',
      children: [],
    };
    ops.seedFile(VAULT, path, entityBody(), fm);
  }
}

function seedOntology(ops: MockVaultOps): void {
  const content = [
    '| rel_type | description | inverse | symmetric |',
    '| --- | --- | --- | --- |',
    '| `depends-on` | A depends on B | `depended-by` | |',
  ].join('\n');
  ops.seedFile(VAULT, `${PROJ_DIR}/_ontology.${PROJECT}.md`, content, {});
}

function seedTopk(ops: MockVaultOps): void {
  ops.seedFile(
    VAULT,
    `${PROJ_DIR}/_topk.${PROJECT}.md`,
    '## Overflow Log\n\n| date | note | field | count | threshold |\n| --- | --- | --- | --- | --- |\n',
    {}
  );
}

/* ---------------------------------------------------------------------------
 * lintProject
 * --------------------------------------------------------------------------- */

describe('lintProject — N+1 regression', () => {
  let ops: MockVaultOps;

  beforeEach(() => {
    ops = new MockVaultOps();
  });

  test('uses single readFiles batch for 10 entity notes', async () => {
    seedEntityNotes(ops, 10);

    await lintProject(VAULT, PROJ_DIR, ops);

    expect(ops.tracker.callCount('listFiles')).toBe(1);
    expect(ops.tracker.callCount('readFiles')).toBe(1);
    expect(ops.tracker.callCount('readFile')).toBe(0);
  });

  test('uses single readFiles batch for 50 entity notes', async () => {
    seedEntityNotes(ops, 50);

    await lintProject(VAULT, PROJ_DIR, ops);

    expect(ops.tracker.callCount('listFiles')).toBe(1);
    expect(ops.tracker.callCount('readFiles')).toBe(1);
    expect(ops.tracker.callCount('readFile')).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * getRelations
 * --------------------------------------------------------------------------- */

describe('getRelations — N+1 regression', () => {
  let ops: MockVaultOps;

  beforeEach(() => {
    ops = new MockVaultOps();
  });

  test('uses readFiles batches for ontology + notes', async () => {
    seedOntology(ops);
    seedEntityNotes(ops, 10);

    await getRelations(VAULT, PROJECT, ops);

    expect(ops.tracker.callCount('listFiles')).toBe(1);
    /* Two readFiles calls: one for ontology, one for entity notes */
    expect(ops.tracker.callCount('readFiles')).toBe(2);
    expect(ops.tracker.callCount('readFile')).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * syncTopk
 * --------------------------------------------------------------------------- */

describe('syncTopk — N+1 regression', () => {
  let ops: MockVaultOps;

  beforeEach(() => {
    ops = new MockVaultOps();
  });

  test('uses single readFiles batch for project notes', async () => {
    seedTopk(ops);
    seedEntityNotes(ops, 10);

    await syncTopk(VAULT, PROJECT, ops);

    expect(ops.tracker.callCount('listFiles')).toBe(1);
    expect(ops.tracker.callCount('readFiles')).toBe(1);
    expect(ops.tracker.callCount('readFile')).toBeLessThanOrEqual(1);
  });
});
