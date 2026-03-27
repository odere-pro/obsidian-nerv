// STORY-033 — Unit tests for add-connection command
// Mocks obEval so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock obsidian before importing the command
// ---------------------------------------------------------------------------
const mockObEval = mock(async (_vault: string, _expr: string): Promise<string> => '');

mock.module('../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mockObEval,
  dailyAppend: mock(async (): Promise<void> => undefined),
  rollbackLog: mock(async (): Promise<void> => undefined),
}));

const { addConnection } = await import('../add-connection');

// Standard write result when the forward connection is successfully written
const successWrite = JSON.stringify({
  forwardWritten: true,
  inverseWritten: true,
  inverseError: '',
});

// Ontology lookup that returns a known rel-type / inverse pair
const ontologyLookup = JSON.stringify({ inverse: 'depended-by', symmetric: false });
const symmetricLookup = JSON.stringify({ inverse: 'compares-to', symmetric: true });

function setupMocks(ontResult: string, writeResult: string): void {
  mockObEval.mockImplementation(async (_v: string, expr: string) => {
    if (expr.includes('cachedRead') || expr.includes('_ontology')) return ontResult;
    return writeResult;
  });
}

describe('addConnection', () => {
  beforeEach(() => {
    mockObEval.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------
  test('returns forwardWritten:skipped when connection already exists', async () => {
    setupMocks(
      ontologyLookup,
      JSON.stringify({ forwardWritten: 'skipped', inverseWritten: false, inverseError: '' })
    );
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.forwardWritten).toBe('skipped');
  });

  // ---------------------------------------------------------------------------
  // Inverse wiring
  // ---------------------------------------------------------------------------
  test('writes inverse connection using ontology lookup', async () => {
    setupMocks(ontologyLookup, successWrite);
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.inverseWritten).toBe(true);
  });

  test('handles symmetric relationship (inverseType equals relType)', async () => {
    setupMocks(symmetricLookup, successWrite);
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'compares-to',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7-connection limit
  // ---------------------------------------------------------------------------
  test('returns error when connection limit is reached on source', async () => {
    setupMocks(
      ontologyLookup,
      JSON.stringify({ error: 'Connection limit (7) reached on PROJ.a - A' })
    );
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Connection limit (7)');
  });

  test('reports inverseError when limit reached on target', async () => {
    setupMocks(
      ontologyLookup,
      JSON.stringify({
        forwardWritten: true,
        inverseWritten: false,
        inverseError: 'Connection limit (7) reached on PROJ.b - B',
      })
    );
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.inverseError).toContain('Connection limit (7)');
  });

  // ---------------------------------------------------------------------------
  // Project slug derivation
  // ---------------------------------------------------------------------------
  test('returns error when source path is not under projects/', async () => {
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'notes/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cannot derive project slug');
  });
});
