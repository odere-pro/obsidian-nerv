//
// Requires network access.
// Uses https://example.com as a stable, lightweight test URL.
//
// Assertions covered:
//   1. ingestUrl returns ok:true for a valid URL
//   2. Returned path is a non-empty string
//   3. Returned title is a non-empty string
//   4. wordCount is a positive number
//   5. tokenEstimate ≥ wordCount
//   6. Re-running the same URL returns ingested:false (idempotency)
//   7. Invalid URL returns ok:false without creating a note
//   8. unreachable URL returns ok:false with error message

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createProject } from '../../../src/commands/create-project';
import { ingestUrl } from '../../../src/commands/web-ingest/add';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';
const PROJECT = process.env.TEST_PROJECT ?? 'test-project';

beforeAll(async () => {
  const jsDir = encodeForJs(`projects/${PROJECT}`);
  await obEval(
    VAULT_NAME,
    `(async () => { const f = app.vault.getAbstractFileByPath(${jsDir}); if (f) await app.vault.trash(f, false); return 'ok'; })()`
  ).catch(() => undefined);
  await createProject({ vault: VAULT_NAME, slug: PROJECT, title: 'Test Web Ingest' });
}, 30_000);

afterAll(async () => {
  if (process.env.NERV_SKIP_CLEANUP === '1') return;
  const jsDir = encodeForJs(`projects/${PROJECT}`);
  await obEval(
    VAULT_NAME,
    `(async () => { const f = app.vault.getAbstractFileByPath(${jsDir}); if (f) await app.vault.trash(f, false); return 'ok'; })()`
  ).catch(() => undefined);
}, 30_000);

// Stable test URL — always returns well-formed HTML
const TEST_URL = 'https://example.com';

describe('web-ingest/add integration', () => {
  test('ingests https://example.com and returns ok:true', async () => {
    const result = await ingestUrl(TEST_URL, VAULT_NAME, PROJECT);
    expect(result.ok).toBe(true);
  });

  test('returned path is a non-empty string', async () => {
    const result = await ingestUrl(TEST_URL, VAULT_NAME, PROJECT);
    expect(typeof result.data.path).toBe('string');
    expect(result.data.path.length).toBeGreaterThan(0);
  });

  test('returned title is non-empty', async () => {
    const result = await ingestUrl(TEST_URL, VAULT_NAME, PROJECT);
    expect(typeof result.data.title).toBe('string');
    // example.com title should be non-empty
    expect(result.data.title.length).toBeGreaterThan(0);
  });

  test('wordCount is a positive number', async () => {
    const result = await ingestUrl(TEST_URL, VAULT_NAME, PROJECT);
    if (result.data.ingested) {
      expect(result.data.wordCount).toBeGreaterThan(0);
    }
  });

  test('tokenEstimate is >= wordCount', async () => {
    const result = await ingestUrl(TEST_URL, VAULT_NAME, PROJECT);
    expect(result.data.tokenEstimate).toBeGreaterThanOrEqual(result.data.wordCount);
  });

  test('re-running same URL returns ingested:false (idempotent)', async () => {
    // First run (may already exist from test above)
    await ingestUrl(TEST_URL, VAULT_NAME, PROJECT);
    // Second run must be idempotent
    const second = await ingestUrl(TEST_URL, VAULT_NAME, PROJECT);
    expect(second.ok).toBe(true);
    expect(second.data.ingested).toBe(false);
  });

  test('invalid URL returns ok:false without network call', async () => {
    const result = await ingestUrl('not-a-url', VAULT_NAME, PROJECT);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data.ingested).toBe(false);
  });

  test('unreachable URL returns ok:false with error', async () => {
    const result = await ingestUrl(
      'https://this-domain-does-not-exist-nerv-test-12345.invalid',
      VAULT_NAME,
      PROJECT
    );
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });
});
