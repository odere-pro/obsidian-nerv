// STORY-036 — weekly-review integration tests
// Runs against a live Obsidian vault.
// Requires: OBSIDIAN_RUNNING=1 environment variable.

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { runWeeklyReview } from '../../../src/commands/weekly-review.ts';
import { lintProject } from '../../../src/commands/cli-lint.ts';
import { findOrphans } from '../../../src/commands/cli-orphans.ts';
import { getRelations } from '../../../src/commands/cli-relations.ts';
import { syncOntology } from '../../../src/commands/sync-ontology.ts';
import { syncVocab } from '../../../src/commands/sync-vocab.ts';
import { syncTopk } from '../../../src/commands/sync-topk.ts';
import { spawnCapture } from '../../../src/lib/shell.ts';
import { dailyAppend, obEval } from '../../../src/lib/obsidian.ts';
import { encodeForJs } from '../../../src/lib/json.ts';

const VAULT = process.env.TEST_VAULT ?? 'study';
const TEST_SLUG = '_weekly-review-test-ts';
const RUNNING = process.env.OBSIDIAN_RUNNING === '1';

const REAL_DEPS = {
  lintProject,
  findOrphans,
  getRelations,
  syncOntology,
  syncVocab,
  syncTopk,
  spawnCapture,
  dailyAppend,
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!RUNNING) return;

  // Create minimal project structure for the test
  const jsSlug = encodeForJs(TEST_SLUG);
  await obEval(
    VAULT,
    `(async () => {
  var projDir = 'projects/' + ${jsSlug};
  var f = app.vault.getAbstractFileByPath(projDir);
  if (!f) await app.vault.createFolder(projDir);

  // Create a minimal _ontology file
  var ontoPath = projDir + '/_ontology.' + ${jsSlug} + '.md';
  if (!app.vault.getAbstractFileByPath(ontoPath)) {
    await app.vault.create(ontoPath, '---\\ntype: ROOT\\nkind: ontology\\nspine: ${TEST_SLUG}\\nstatus: active\\ncreated: 2026-01-01\\ntitle: Ontology\\naliases: []\\nupdated: 2026-01-01\\n---\\n# Ontology\\n');
  }

  // Create a minimal _vocab file
  var vocabPath = projDir + '/_vocab.' + ${jsSlug} + '.md';
  if (!app.vault.getAbstractFileByPath(vocabPath)) {
    await app.vault.create(vocabPath, '---\\ntype: ROOT\\nkind: vocab\\nspine: ${TEST_SLUG}\\nstatus: active\\ncreated: 2026-01-01\\ntitle: Vocab\\naliases: []\\nupdated: 2026-01-01\\n---\\n# Vocabulary — ${TEST_SLUG}\\n');
  }

  // Create a minimal _topk file
  var topkPath = projDir + '/_topk.' + ${jsSlug} + '.md';
  if (!app.vault.getAbstractFileByPath(topkPath)) {
    await app.vault.create(topkPath, '---\\nupdated: 2026-01-01\\n---\\n# Top-K\\n\\n## Overflow Log\\n\\n| Date | Note | Field | Count | Threshold |\\n|------|------|-------|-------|-----------|\\n');
  }
})()`
  );
});

afterAll(async () => {
  if (!RUNNING) return;
  const jsSlug = encodeForJs(TEST_SLUG);
  await obEval(
    VAULT,
    `(async () => {
  var f = app.vault.getAbstractFileByPath('projects/' + ${jsSlug});
  if (f) await app.vault.trash(f, false);
})()`
  ).catch(() => undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('weekly-review integration', () => {
  test.skipIf(!RUNNING)('returns WeeklyReviewResult with correct schema keys', async () => {
    const { result } = await runWeeklyReview(VAULT, TEST_SLUG, true, REAL_DEPS);
    expect(result).toHaveProperty('lint');
    expect(result).toHaveProperty('orphans');
    expect(result).toHaveProperty('relations');
    expect(result).toHaveProperty('ontology');
    expect(result).toHaveProperty('unresolved');
  });

  test.skipIf(!RUNNING)('--json result values are numbers', async () => {
    const { result } = await runWeeklyReview(VAULT, TEST_SLUG, true, REAL_DEPS);
    expect(typeof result.lint.issues).toBe('number');
    expect(typeof result.orphans.issues).toBe('number');
    expect(typeof result.relations.unknown).toBe('number');
    expect(typeof result.ontology.missingInverses).toBe('number');
    expect(typeof result.unresolved).toBe('number');
  });

  test.skipIf(!RUNNING)('runs without throwing on empty project', async () => {
    const { failedCmd } = await runWeeklyReview(VAULT, TEST_SLUG, true, REAL_DEPS);
    // sync-topk may fail if _topk is missing, but lint/orphans/relations/ontology should pass
    // An empty project produces no critical failures
    expect(typeof failedCmd).toBe('string');
  });
});
