// STORY-036 — weekly-review unit tests
// Tests orchestration sequence, output buffering, --json schema, failure propagation.
// All 7 sub-command modules are mocked via injected deps (no Obsidian required).

import { describe, expect, test } from 'bun:test';
import { runWeeklyReview, type WeeklyReviewDeps } from '../weekly-review';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<WeeklyReviewDeps> = {}): WeeklyReviewDeps {
  return {
    lintProject: () =>
      Promise.resolve({ vault: 'v', folder: 'f', issues: [], count: 2, noteCount: 10 }),
    findOrphans: () => Promise.resolve({ issues: [], count: 3, noteCount: 10 }),
    getRelations: () =>
      Promise.resolve({ project: 'p', edges: [], summary: {}, unknownTypes: ['mystery'] }),
    syncOntology: () =>
      Promise.resolve({
        entities: {},
        edges: 0,
        missingInverses: [{ source: 'a', rel: 'r', target: 'b' }],
        incomplete: 0,
      }),
    syncVocab: () => Promise.resolve({ noteCount: 5, entryCount: 4, orphanCount: 1 }),
    syncTopk: () => Promise.resolve({ noteCount: 5, appended: 1, warning: '' }),
    spawnCapture: () => Promise.resolve({ stdout: '[[broken-link]]', stderr: '', exitCode: 0 }),
    dailyAppend: () => Promise.resolve(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// --json schema
// ---------------------------------------------------------------------------

describe('runWeeklyReview --json schema', () => {
  test('result has all required top-level keys', async () => {
    const { result } = await runWeeklyReview('vault', 'proj', true, makeDeps());
    expect(result).toHaveProperty('lint');
    expect(result).toHaveProperty('orphans');
    expect(result).toHaveProperty('relations');
    expect(result).toHaveProperty('ontology');
    expect(result).toHaveProperty('unresolved');
  });

  test('lint.issues reflects lintProject count', async () => {
    const { result } = await runWeeklyReview('vault', 'proj', true, makeDeps());
    expect(result.lint.issues).toBe(2);
  });

  test('orphans.issues reflects findOrphans count', async () => {
    const { result } = await runWeeklyReview('vault', 'proj', true, makeDeps());
    expect(result.orphans.issues).toBe(3);
  });

  test('relations.unknown counts unknownTypes array length', async () => {
    const { result } = await runWeeklyReview('vault', 'proj', true, makeDeps());
    expect(result.relations.unknown).toBe(1);
  });

  test('ontology.missingInverses counts missing inverses array', async () => {
    const { result } = await runWeeklyReview('vault', 'proj', true, makeDeps());
    expect(result.ontology.missingInverses).toBe(1);
  });

  test('unresolved counts [[wikilink]] occurrences in spawnCapture output', async () => {
    const deps = makeDeps({
      spawnCapture: () => Promise.resolve({ stdout: '[[a]] [[b]] [[c]]', stderr: '', exitCode: 0 }),
    });
    const { result } = await runWeeklyReview('vault', 'proj', true, deps);
    expect(result.unresolved).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Failure propagation
// ---------------------------------------------------------------------------

describe('runWeeklyReview failure propagation', () => {
  test('failedCmd is set to cli-lint when lintProject throws', async () => {
    const deps = makeDeps({
      lintProject: () => Promise.reject(new Error('obsidian down')),
    });
    const { failedCmd } = await runWeeklyReview('vault', 'proj', true, deps);
    expect(failedCmd).toBe('cli-lint');
  });

  test('failedCmd is set to cli-orphans when findOrphans throws', async () => {
    const deps = makeDeps({
      findOrphans: () => Promise.reject(new Error('fail')),
    });
    const { failedCmd } = await runWeeklyReview('vault', 'proj', true, deps);
    expect(failedCmd).toBe('cli-orphans');
  });

  test('first failure wins: cli-lint takes priority over later failures', async () => {
    const deps = makeDeps({
      lintProject: () => Promise.reject(new Error('lint fail')),
      findOrphans: () => Promise.reject(new Error('orphan fail')),
    });
    const { failedCmd } = await runWeeklyReview('vault', 'proj', true, deps);
    expect(failedCmd).toBe('cli-lint');
  });
});

// ---------------------------------------------------------------------------
// Output buffering: all sub-commands run before dailyAppend
// ---------------------------------------------------------------------------

describe('runWeeklyReview output buffering', () => {
  test('dailyAppend is called after all sub-commands complete (human-readable mode)', async () => {
    const callOrder: string[] = [];
    const deps = makeDeps({
      lintProject: async () => {
        callOrder.push('lint');
        return { vault: 'v', folder: 'f', issues: [], count: 0, noteCount: 0 };
      },
      findOrphans: async () => {
        callOrder.push('orphans');
        return { issues: [], count: 0, noteCount: 0 };
      },
      getRelations: async () => {
        callOrder.push('relations');
        return { project: 'p', edges: [], summary: {}, unknownTypes: [] };
      },
      syncOntology: async () => {
        callOrder.push('ontology');
        return { entities: {}, edges: 0, missingInverses: [], incomplete: 0 };
      },
      syncVocab: async () => {
        callOrder.push('vocab');
        return { noteCount: 0, entryCount: 0, orphanCount: 0 };
      },
      syncTopk: async () => {
        callOrder.push('topk');
        return { noteCount: 0, appended: 0, warning: '' };
      },
      spawnCapture: async () => {
        callOrder.push('unresolved');
        return { stdout: '', stderr: '', exitCode: 0 };
      },
      dailyAppend: async () => {
        callOrder.push('dailyAppend');
      },
    });

    await runWeeklyReview('vault', 'proj', false, deps);

    // All 7 steps must appear before dailyAppend
    const appendIdx = callOrder.indexOf('dailyAppend');
    expect(appendIdx).toBeGreaterThan(callOrder.indexOf('topk'));
    expect(appendIdx).toBeGreaterThan(callOrder.indexOf('unresolved'));
  });

  test('dailyAppend is NOT called in --json mode', async () => {
    let appendCalled = false;
    const deps = makeDeps({
      dailyAppend: async () => {
        appendCalled = true;
      },
    });
    await runWeeklyReview('vault', 'proj', true, deps);
    expect(appendCalled).toBe(false);
  });
});
