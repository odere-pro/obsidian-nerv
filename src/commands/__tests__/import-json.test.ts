// STORY-033 — Unit tests for import-json command
// Mocks obEval and Bun.file so no Obsidian instance is required.

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock obsidian.ts before importing the command
// ---------------------------------------------------------------------------
const mockObEval = mock(async (_vault: string, _expr: string): Promise<string> => 'absent');
const mockDailyAppend = mock(async (): Promise<void> => undefined);
const mockRollbackLog = mock(async (): Promise<void> => undefined);

mock.module('../../lib/obsidian.ts', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mockObEval,
  dailyAppend: mockDailyAppend,
  rollbackLog: mockRollbackLog,
}));

const { importJson } = await import('../import-json.ts');

// ---------------------------------------------------------------------------
// Standard obEval mock for create-entity flow:
//   1. idempotency check → 'absent'
//   2. parent lookup → JSON with basename + spine
//   3. file create → 'ok'
//   4. parent children update → 'ok'
// ---------------------------------------------------------------------------
function setupCreateMocks(): void {
  mockObEval.mockImplementation(async (_v: string, expr: string) => {
    if (expr.includes("'exists'") || expr.includes("'absent'")) return 'absent';
    if (expr.includes('getFiles') && expr.includes('startsWith(prefix)')) {
      return JSON.stringify({ basename: 'PROJ.ROOT - Project', spine: 'proj' });
    }
    if (expr.includes('vault.create')) return 'ok';
    if (expr.includes('processFrontMatter')) return 'ok';
    return 'ok';
  });
}

describe('importJson', () => {
  beforeEach(() => {
    mockObEval.mockReset();
    mockDailyAppend.mockReset();
    mockRollbackLog.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Skip / create counting
  // ---------------------------------------------------------------------------
  test('counts created notes correctly', async () => {
    setupCreateMocks();
    const { created, skipped } = await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        { name: 'NoteA', type: 'LEAF', kind: 'concept' },
        { name: 'NoteB', type: 'LEAF', kind: 'concept' },
      ],
    });
    expect(created).toBe(2);
    expect(skipped).toBe(0);
  });

  test('skips notes that already exist (idempotency)', async () => {
    mockObEval.mockImplementation(async (_v: string, expr: string) => {
      // All idempotency checks return 'exists'
      if (expr.includes("'exists'") || expr.includes("'absent'")) return 'exists';
      return 'ok';
    });
    const { created, skipped } = await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [{ name: 'ExistingNote', type: 'LEAF', kind: 'concept' }],
    });
    expect(created).toBe(0);
    expect(skipped).toBe(1);
  });

  test('skips entries with missing name and increments skipped count', async () => {
    setupCreateMocks();
    const { created, skipped } = await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        { name: '' } as { name: string },
        { name: 'ValidNote', type: 'LEAF', kind: 'concept' },
      ],
    });
    expect(skipped).toBe(1);
    expect(created).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Extra field passthrough
  // ---------------------------------------------------------------------------
  test('calls processFrontMatter for extra non-standard fields', async () => {
    setupCreateMocks();
    await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        {
          name: 'NoteWithExtra',
          type: 'LEAF',
          kind: 'concept',
          priority: 'high',
          team: 'platform',
        },
      ],
    });
    const extraCall = mockObEval.mock.calls.find(
      c =>
        (c[1] as string).includes('processFrontMatter') &&
        (c[1] as string).includes('Object.assign')
    );
    expect(extraCall).toBeDefined();
    expect(extraCall![1]).toContain('priority');
    expect(extraCall![1]).toContain('team');
  });

  test('does not call processFrontMatter when there are no extra fields', async () => {
    setupCreateMocks();
    await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        { name: 'PlainNote', type: 'LEAF', kind: 'concept', spine: 'proj', parent: 'ROOT' },
      ],
    });
    const extraCall = mockObEval.mock.calls.find(c => (c[1] as string).includes('Object.assign'));
    expect(extraCall).toBeUndefined();
  });
});
