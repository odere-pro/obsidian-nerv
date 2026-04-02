//
// Ports assertions from cli/core/tests/test-code-link.sh.
// Run: bun test tests/integration/domain/code-link.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createEntity } from '../../../src/commands/create-entity';
import { createProject } from '../../../src/commands/create-project';
import { codeLink } from '../../../src/commands/dev/code-link';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';

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

describe('code-link integration', () => {
  beforeAll(async () => {
    await cleanup();
    await createProject({ vault: VAULT_NAME, slug: PROJ_SLUG, title: PROJ_TITLE });
    await createEntity({
      vault: VAULT_NAME,
      project: PROJ_SLUG,
      type: 'LEAF',
      slug: NOTE_SLUG,
      title: NOTE_TITLE,
      parentSlug: 'ROOT',
      kind: 'concept',
    });
  }, 30_000);

  afterAll(async () => {
    if (process.env.NERV_SKIP_CLEANUP === '1') return;
    await cleanup();
  });

  test('appends code path to ## Connections section', async () => {
    const result = await codeLink(VAULT_NAME, NOTE_PATH, CODE_PATH);
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(true);
    const content = await readFile(NOTE_PATH);
    expect(content).toContain(`- implements :: \`${CODE_PATH}\``);
  }, 30_000);

  test('idempotent: second call returns appended:false with no duplicate entry', async () => {
    const result = await codeLink(VAULT_NAME, NOTE_PATH, CODE_PATH);
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(false);
    const content = await readFile(NOTE_PATH);
    const count = (content.match(new RegExp(CODE_PATH.replace(/\//g, '\\/'), 'g')) ?? []).length;
    expect(count).toBe(1);
  }, 30_000);

  test('rejects code path containing ]] (security validation)', async () => {
    const result = await codeLink(VAULT_NAME, NOTE_PATH, 'src/bad]]path');
    expect(result.ok).toBe(false);
    expect(result.error).toContain(']]');
  });
});
