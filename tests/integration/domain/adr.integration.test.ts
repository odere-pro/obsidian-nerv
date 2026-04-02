//
// Ports assertions from cli/core/tests/test-adr.sh.
// Run: bun test tests/integration/domain/adr.integration.test

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createProject } from '../../../src/commands/create-project';
import { createAdr } from '../../../src/commands/dev/adr';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';

const PROJ_SLUG = 'testadr-ts';
const PROJ_TITLE = 'Test ADR TS';
const PROJ_UPPER = PROJ_SLUG.toUpperCase();
const PROJ_DIR = `projects/${PROJ_SLUG}`;

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

describe('adr integration', () => {
  let adrPath = '';

  beforeAll(async () => {
    await cleanup();
    await createProject({ vault: VAULT_NAME, slug: PROJ_SLUG, title: PROJ_TITLE });
  }, 30_000);

  afterAll(async () => {
    if (process.env.NERV_SKIP_CLEANUP === '1') return;
    await cleanup();
  });

  test('creates ADR note at correct vault path', async () => {
    const result = await createAdr({
      vault: VAULT_NAME,
      project: PROJ_SLUG,
      title: 'Use Event Sourcing',
    });
    expect(result.ok).toBe(true);
    adrPath = result.data.path;
    expect(await fileExists(adrPath)).toBe(true);
  }, 30_000);

  test('ADR note has kind: decision in frontmatter', async () => {
    const content = await readFile(adrPath);
    expect(content).toContain('kind: decision');
  });

  test('ADR note has decision-status: proposed', async () => {
    const content = await readFile(adrPath);
    expect(content).toContain('decision-status: proposed');
  });

  test('ADR note has decision-date field in frontmatter', async () => {
    const content = await readFile(adrPath);
    expect(content).toMatch(/decision-date:/);
  });

  test('ADR body contains ### Context, ### Decision, ### Consequences', async () => {
    const content = await readFile(adrPath);
    expect(content).toContain('### Context');
    expect(content).toContain('### Decision');
    expect(content).toContain('### Consequences');
  });

  test('parent ROOT has ADR wikilink in children array', async () => {
    const rootPath = `${PROJ_DIR}/${PROJ_UPPER}.ROOT - ${PROJ_TITLE}.md`;
    const content = await readFile(rootPath);
    expect(content).toContain('use-event-sourcing');
  });
});
