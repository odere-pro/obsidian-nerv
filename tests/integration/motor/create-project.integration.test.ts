//
// Ports assertions from cli/core/tests/test-create-project.sh.
// Run: bun test tests/integration/motor/create-project.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createProject } from '../../../src/commands/create-project';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';

const TEST_SLUG = 'testcp-ts';
const TEST_TITLE = 'Test Create Project TS';
const SLUG_UPPER = TEST_SLUG.toUpperCase();
const PROJ_DIR = `projects/${TEST_SLUG}`;

const ROOT_PATH = `${PROJ_DIR}/${SLUG_UPPER}.ROOT - ${TEST_TITLE}.md`;
const ONTO_PATH = `${PROJ_DIR}/_ontology.${TEST_SLUG}.md`;
const VOCAB_PATH = `${PROJ_DIR}/_vocab.${TEST_SLUG}.md`;
const TOPK_PATH = `${PROJ_DIR}/_topk.${TEST_SLUG}.md`;
const BASE_PATH = `${PROJ_DIR}/${TEST_SLUG}.base`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fileExists(path: string): Promise<boolean> {
  const result = await obEval(
    VAULT_NAME,
    `app.vault.getAbstractFileByPath(${encodeForJs(path)}) ? 'yes' : 'no'`
  ).catch(() => 'no');
  return result === 'yes';
}

async function readFile(path: string): Promise<string> {
  return obEval(
    VAULT_NAME,
    `(async () => { const f = app.vault.getAbstractFileByPath(${encodeForJs(path)}); return f ? await app.vault.cachedRead(f) : ''; })()`
  ).catch(() => '');
}

async function cleanup(): Promise<void> {
  await obEval(
    VAULT_NAME,
    `(async () => { const f = app.vault.getAbstractFileByPath(${encodeForJs(PROJ_DIR)}); if (f) await app.vault.trash(f, false); })()`
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('create-project integration', () => {
  beforeAll(async () => {
    await cleanup();
    await createProject({ vault: VAULT_NAME, slug: TEST_SLUG, title: TEST_TITLE });
  });

  afterAll(async () => {
    // await cleanup();
  });

  // ---------------------------------------------------------------------------
  // All 5 files exist
  // ---------------------------------------------------------------------------
  test('creates ROOT note', async () => {
    expect(await fileExists(ROOT_PATH)).toBe(true);
  });

  test('creates _ontology file', async () => {
    expect(await fileExists(ONTO_PATH)).toBe(true);
  });

  test('creates _vocab file', async () => {
    expect(await fileExists(VOCAB_PATH)).toBe(true);
  });

  test('creates _topk file', async () => {
    expect(await fileExists(TOPK_PATH)).toBe(true);
  });

  test('creates .base file', async () => {
    expect(await fileExists(BASE_PATH)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // ROOT frontmatter fields
  // ---------------------------------------------------------------------------
  test('ROOT note contains correct frontmatter fields', async () => {
    const content = await readFile(ROOT_PATH);
    expect(content).toContain('type: ROOT');
    expect(content).toContain('kind: concept');
    expect(content).toContain(`spine: ${TEST_SLUG}`);
    expect(content).toContain('status: draft');
    expect(content).toContain('children: []');
    expect(content).toMatch(/created: \d{4}-\d{2}-\d{2}/);
    expect(content).toMatch(/modified: \d{4}-\d{2}-\d{2}/);
  });

  // ---------------------------------------------------------------------------
  // Ontology contains all 10 relationship types
  // ---------------------------------------------------------------------------
  test('_ontology contains all 10 relationship types', async () => {
    const content = await readFile(ONTO_PATH);
    for (const rel of [
      'triggers',
      'depends-on',
      'implements',
      'extends',
      'compares-to',
      'replaces',
      'feeds-data',
      'authenticates-via',
      'contains',
      'mitigates',
    ]) {
      expect(content).toContain(`\`${rel}\``);
    }
  });

  // ---------------------------------------------------------------------------
  // .base file content
  // ---------------------------------------------------------------------------
  test('.base contains correct inFolder filter', async () => {
    const content = await readFile(BASE_PATH);
    expect(content).toContain(`file.inFolder("projects/${TEST_SLUG}")`);
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------
  test('re-running exits 0 and reports already-exists', async () => {
    const out: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s: string) => {
      out.push(s);
      return true;
    };
    try {
      await createProject({ vault: VAULT_NAME, slug: TEST_SLUG, title: TEST_TITLE });
    } finally {
      process.stdout.write = orig;
    }
    expect(out.join('')).toContain('already exists');
  });
});
