// STORY-037 — Integration tests for dev/dependency-map command
//
// Ports assertions from cli/core/tests/test-dependency-map.sh.
// Requires OBSIDIAN_RUNNING=1 to execute; skips the full suite otherwise.
//
// Run: OBSIDIAN_RUNNING=1 bun test tests/integration/domain/dependency-map.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createProject } from '../../../src/commands/create-project';
import { edgesToDot, getDependencyMap } from '../../../src/commands/dev/dependency-map';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const RUNNING = process.env.OBSIDIAN_RUNNING === '1';
const VAULT = process.env.TEST_VAULT ?? 'study';

const PROJ_SLUG = 'testdm-ts';
const PROJ_TITLE = 'Test Dependency Map TS';
const PROJ_DIR = `projects/${PROJ_SLUG}`;

async function cleanup(): Promise<void> {
  await obEval(
    VAULT,
    `(async () => { const f = app.vault.getAbstractFileByPath(${encodeForJs(PROJ_DIR)}); if (f) await app.vault.trash(f, false); })()`
  ).catch(() => undefined);
}

describe('dependency-map integration', () => {
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

  test('returns JSON result with project and edges fields', async () => {
    const result = await getDependencyMap(VAULT, PROJ_SLUG);
    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('project', PROJ_SLUG);
    expect(result.data).toHaveProperty('edges');
    expect(Array.isArray(result.data.edges)).toBe(true);
  }, 30_000);

  test('all returned edges have source and target fields', async () => {
    const result = await getDependencyMap(VAULT, PROJ_SLUG);
    expect(result.ok).toBe(true);
    for (const edge of result.data.edges) {
      expect(edge).toHaveProperty('source');
      expect(edge).toHaveProperty('target');
    }
  }, 30_000);

  test('DOT output from edgesToDot starts with digraph and contains ->', () => {
    const dot = edgesToDot(PROJ_SLUG, [{ source: 'note-a', target: 'note-b', context: '' }]);
    expect(dot.trim()).toMatch(/^digraph/);
    expect(dot).toContain('->');
  });
});
