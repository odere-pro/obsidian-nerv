//
// Ports assertions from cli/core/tests/test-dependency-map.sh.
// Run: bun test tests/integration/domain/dependency-map.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createProject } from '../../../src/commands/create-project';
import { edgesToDot, getDependencyMap } from '../../../src/commands/dev/dependency-map';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';

const PROJ_SLUG = 'testdm-ts';
const PROJ_TITLE = 'Test Dependency Map TS';
const PROJ_DIR = `projects/${PROJ_SLUG}`;

async function cleanup(): Promise<void> {
  await obEval(
    VAULT_NAME,
    `(async () => { const f = app.vault.getAbstractFileByPath(${encodeForJs(PROJ_DIR)}); if (f) await app.vault.trash(f, false); })()`
  ).catch(() => undefined);
}

describe('dependency-map integration', () => {
  beforeAll(async () => {
    await cleanup();
    await createProject({ vault: VAULT_NAME, slug: PROJ_SLUG, title: PROJ_TITLE });
  }, 30_000);

  afterAll(async () => {
    if (process.env.NERV_SKIP_CLEANUP === '1') return;
    await cleanup();
  });

  test('returns JSON result with project and edges fields', async () => {
    const result = await getDependencyMap(VAULT_NAME, PROJ_SLUG);
    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('project', PROJ_SLUG);
    expect(result.data).toHaveProperty('edges');
    expect(Array.isArray(result.data.edges)).toBe(true);
  }, 30_000);

  test('all returned edges have source and target fields', async () => {
    const result = await getDependencyMap(VAULT_NAME, PROJ_SLUG);
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
