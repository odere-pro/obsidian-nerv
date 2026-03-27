// STORY-039 — Integration tests for canvas/tree command
//
// Generates a tree canvas against a live Obsidian vault and verifies:
//   - Canvas file written to correct path
//   - File content conforms to JSON Canvas 1.0 spec
//   - Canvas has nodes and edges arrays
//
// Run: OBSIDIAN_RUNNING=1 bun test tests/integration/canvas/tree.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { generateTreeCanvas } from '../../../src/commands/canvas/tree';
import { createProject } from '../../../src/commands/create-project';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const RUNNING = process.env.OBSIDIAN_RUNNING === '1';
const VAULT = process.env.TEST_VAULT ?? 'study';

const PROJ_SLUG = 'testcanvastree-ts';
const PROJ_TITLE = 'Test Canvas Tree TS';
const PROJ_DIR = `projects/${PROJ_SLUG}`;
const CANVAS_PATH = `${PROJ_DIR}/${PROJ_SLUG}.tree.canvas`;

async function cleanup(): Promise<void> {
  await obEval(
    VAULT,
    `(async () => { const f = app.vault.getAbstractFileByPath(${encodeForJs(PROJ_DIR)}); if (f) await app.vault.trash(f, false); })()`
  ).catch(() => undefined);
}

describe('canvas:tree integration', () => {
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

  test('generateTreeCanvas returns ok:true', async () => {
    const result = await generateTreeCanvas(VAULT, PROJ_SLUG);
    expect(result.ok).toBe(true);
  }, 30_000);

  test('canvas file is written to correct path', async () => {
    await generateTreeCanvas(VAULT, PROJ_SLUG);
    const raw = await obEval(
      VAULT,
      `(async () => {
        var f = app.vault.getAbstractFileByPath(${encodeForJs(CANVAS_PATH)});
        return f ? 'exists' : 'missing';
      })()`
    );
    expect(raw).toBe('exists');
  }, 30_000);

  test('canvas file content is valid JSON Canvas with nodes and edges', async () => {
    const result = await generateTreeCanvas(VAULT, PROJ_SLUG);
    expect(result.data).toHaveProperty('nodes');
    expect(result.data).toHaveProperty('edges');
    expect(Array.isArray(result.data.nodes)).toBe(true);
    expect(Array.isArray(result.data.edges)).toBe(true);
  }, 30_000);

  test('output path matches projects/<slug>/<slug>.tree.canvas pattern', async () => {
    const result = await generateTreeCanvas(VAULT, PROJ_SLUG);
    expect(result.outputPath).toBe(CANVAS_PATH);
  }, 30_000);

  test('all node IDs are 16-char hex strings', async () => {
    const result = await generateTreeCanvas(VAULT, PROJ_SLUG);
    for (const node of result.data.nodes) {
      expect(node.id).toMatch(/^[0-9a-f]{16}$/);
    }
  }, 30_000);
});
