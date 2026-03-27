// STORY-037 — Integration tests for dev/code-link command
//
// Ports assertions from cli/core/tests/test-code-link.sh.
// Requires OBSIDIAN_RUNNING=1 to execute; skips the full suite otherwise.
//
// Run: OBSIDIAN_RUNNING=1 bun test tests/integration/domain/code-link.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createEntity } from '../../../src/commands/create-entity';
import { createProject } from '../../../src/commands/create-project';
import { codeLink } from '../../../src/commands/dev/code-link';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const RUNNING = process.env.OBSIDIAN_RUNNING === '1';
const VAULT = process.env.TEST_VAULT ?? 'study';

const PROJ_SLUG = 'testcl-ts';
const PROJ_TITLE = 'Test Code Link TS';
const PROJ_UPPER = PROJ_SLUG.toUpperCase();
const PROJ_DIR = `projects/${PROJ_SLUG}`;

const NOTE_SLUG = 'test-note-ts';
const NOTE_TITLE = 'Test Note TS';
const NOTE_PATH = `${PROJ_DIR}/${PROJ_UPPER}.${NOTE_SLUG} - ${NOTE_TITLE}.md`;
const CODE_PATH = 'src/commands/create-entity';

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

describe('code-link integration', () => {
  if (!RUNNING) {
    test.skip('OBSIDIAN_RUNNING=1 not set — skipping integration suite', () => {});
    return;
  }

  beforeAll(async () => {
    await cleanup();
    await createProject({ vault: VAULT, slug: PROJ_SLUG, title: PROJ_TITLE });
    await createEntity({
      vault: VAULT,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: NOTE_SLUG,
      title: NOTE_TITLE,
      parentSlug: 'ROOT',
      kind: 'concept',
    });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  });

  test('appends code path to ## Connections section', async () => {
    const result = await codeLink(VAULT, NOTE_PATH, CODE_PATH);
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(true);
    const content = await readFile(NOTE_PATH);
    expect(content).toContain(`- implements :: \`${CODE_PATH}\``);
  }, 30_000);

  test('idempotent: second call returns appended:false with no duplicate entry', async () => {
    const result = await codeLink(VAULT, NOTE_PATH, CODE_PATH);
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(false);
    const content = await readFile(NOTE_PATH);
    const count = (content.match(new RegExp(CODE_PATH.replace(/\//g, '\\/'), 'g')) ?? []).length;
    expect(count).toBe(1);
  }, 30_000);

  test('rejects code path containing ]] (security validation)', async () => {
    const result = await codeLink(VAULT, NOTE_PATH, 'src/bad]]path');
    expect(result.ok).toBe(false);
    expect(result.error).toContain(']]');
  });
});
