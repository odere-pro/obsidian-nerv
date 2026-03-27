// STORY-033 — Integration tests for create-entity command
//
// Ports assertions from cli/core/tests/test-create-entity.sh.
// Requires OBSIDIAN_RUNNING=1 to execute; skips the full suite otherwise.
//
// Run: OBSIDIAN_RUNNING=1 bun test tests/integration/motor/create-entity.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createEntity } from '../../../src/commands/create-entity';
import { createProject } from '../../../src/commands/create-project';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const RUNNING = process.env.OBSIDIAN_RUNNING === '1';
const VAULT = process.env.TEST_VAULT ?? 'study';

const PROJ_SLUG = 'testce-ts';
const PROJ_TITLE = 'Test Create Entity TS';
const PROJ_UPPER = PROJ_SLUG.toUpperCase();
const PROJ_DIR = `projects/${PROJ_SLUG}`;
const ROOT_PATH = `${PROJ_DIR}/${PROJ_UPPER}.ROOT - ${PROJ_TITLE}.md`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fileExists(path: string): Promise<boolean> {
  const result = await obEval(
    VAULT,
    `app.vault.getAbstractFileByPath(${encodeForJs(path)}) ? 'yes' : 'no'`
  ).catch(() => 'no');
  return result === 'yes';
}

async function readFile(path: string): Promise<string> {
  return obEval(
    VAULT,
    `(async () => { const f = app.vault.getAbstractFileByPath(${encodeForJs(path)}); return f ? await app.vault.cachedRead(f) : ''; })()`
  ).catch(() => '');
}

async function cleanup(): Promise<void> {
  await obEval(
    VAULT,
    `(async () => { const f = app.vault.getAbstractFileByPath(${encodeForJs(PROJ_DIR)}); if (f) await app.vault.trash(f, false); })()`
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('create-entity integration', () => {
  if (!RUNNING) {
    test.skip('OBSIDIAN_RUNNING=1 not set — skipping integration suite', () => {});
    return;
  }

  beforeAll(async () => {
    await cleanup();
    await createProject({ vault: VAULT, slug: PROJ_SLUG, title: PROJ_TITLE });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  });

  // ---------------------------------------------------------------------------
  // Test 1: create a LEAF entity
  // ---------------------------------------------------------------------------
  const LEAF_SLUG = 'test-leaf-ts';
  const LEAF_TITLE = 'Test Leaf TS';
  const LEAF_PATH = `${PROJ_DIR}/${PROJ_UPPER}.${LEAF_SLUG} - ${LEAF_TITLE}.md`;

  test('creates a LEAF entity at the correct path', async () => {
    const result = await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: LEAF_SLUG,
      title: LEAF_TITLE,
      parentSlug: 'ROOT',
      kind: 'concept',
      spine: PROJ_SLUG,
    });
    expect(result.ok).toBe(true);
    expect(await fileExists(LEAF_PATH)).toBe(true);
  });

  test('LEAF note has correct frontmatter fields', async () => {
    const content = await readFile(LEAF_PATH);
    expect(content).toContain('type: LEAF');
    expect(content).toContain('kind: concept');
    expect(content).toContain(`spine: ${PROJ_SLUG}`);
    expect(content).toContain('status: draft');
    expect(content).toContain('children: []');
  });

  test('LEAF parent field contains ROOT wikilink', async () => {
    const content = await readFile(LEAF_PATH);
    expect(content).toContain(`[[${PROJ_UPPER}.ROOT - `);
  });

  // ---------------------------------------------------------------------------
  // Test 2: parent children array updated
  // ---------------------------------------------------------------------------
  test('ROOT children array contains LEAF wikilink after create', async () => {
    const content = await readFile(ROOT_PATH);
    expect(content).toContain(`[[${PROJ_UPPER}.${LEAF_SLUG} - ${LEAF_TITLE}]]`);
  });

  // ---------------------------------------------------------------------------
  // Test 3: spine inheritance (BRANCH without explicit spine)
  // ---------------------------------------------------------------------------
  const BRANCH_SLUG = 'test-branch-ts';
  const BRANCH_TITLE = 'Test Branch TS';
  const BRANCH_PATH = `${PROJ_DIR}/${PROJ_UPPER}.${BRANCH_SLUG} - ${BRANCH_TITLE}.md`;

  test('BRANCH inherits spine from parent when spine arg is omitted', async () => {
    await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'BRANCH',
      slug: BRANCH_SLUG,
      title: BRANCH_TITLE,
      parentSlug: 'ROOT',
      kind: 'concept',
    });
    const content = await readFile(BRANCH_PATH);
    expect(content).toContain(`spine: ${PROJ_SLUG}`);
  });

  // ---------------------------------------------------------------------------
  // Test 4: idempotency
  // ---------------------------------------------------------------------------
  test('re-running create-entity exits ok without modifying the note', async () => {
    const result = await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: LEAF_SLUG,
      title: LEAF_TITLE,
      parentSlug: 'ROOT',
      kind: 'concept',
      spine: PROJ_SLUG,
    });
    expect(result.ok).toBe(true);
    expect(result.data.created).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 5: --json output (via programmatic API)
  // ---------------------------------------------------------------------------
  test('--json: new entity returns created:true with path and title', async () => {
    const newSlug = 'test-leaf-json-ts';
    const newTitle = 'Test Leaf JSON TS';
    const result = await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: newSlug,
      title: newTitle,
      parentSlug: 'ROOT',
      kind: 'concept',
      spine: PROJ_SLUG,
    });
    expect(result.data.created).toBe(true);
    expect(typeof result.data.path).toBe('string');
    expect(result.data.path.length).toBeGreaterThan(0);
    expect(result.data.title).toBe(newTitle);
  });

  test('--json: idempotent re-run returns created:false (no error)', async () => {
    const result = await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: LEAF_SLUG,
      title: LEAF_TITLE,
      parentSlug: 'ROOT',
      kind: 'concept',
      spine: PROJ_SLUG,
    });
    expect(result.ok).toBe(true);
    expect(result.data.created).toBe(false);
  });

  test('--json: missing parent returns ok:false with error string', async () => {
    const result = await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: 'no-parent-leaf',
      title: 'No Parent Leaf',
      parentSlug: 'NONEXISTENT',
      kind: 'concept',
    });
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.data.created).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 6: missing parent exits with error
  // ---------------------------------------------------------------------------
  test('missing parent slug causes ok:false result', async () => {
    const result = await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: 'orphan-leaf',
      title: 'Orphan Leaf',
      parentSlug: 'NOSUCHPARENT',
      kind: 'concept',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
