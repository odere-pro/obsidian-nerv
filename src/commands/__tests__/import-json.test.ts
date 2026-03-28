// Mocks VaultOps so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { VaultOps } from '../../ports/vault-ops';

// ---------------------------------------------------------------------------
// Mock obsidian (for rollbackLog / resolveVault) and provider (for VaultOps)
// ---------------------------------------------------------------------------
const mockRollbackLog = mock(async (): Promise<void> => undefined);

mock.module('../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  rollbackLog: mockRollbackLog,
}));

const mockFileExists = mock(async (_v: string, _p: string): Promise<boolean> => false);
const mockListFiles = mock(
  async (_v: string) => [] as { path: string; frontmatter: Record<string, unknown> }[]
);
const mockCreateFile = mock(async (_v: string, _p: string, _c: string): Promise<void> => undefined);
const mockUpdateFrontmatter = mock(
  async (_v: string, _p: string, _m: Record<string, unknown>): Promise<void> => undefined
);
const mockAppendToDaily = mock(async (_v: string, _c: string): Promise<void> => undefined);

const mockOps: VaultOps = {
  fileExists: mockFileExists,
  listFiles: mockListFiles,
  createFile: mockCreateFile,
  updateFrontmatter: mockUpdateFrontmatter,
  appendToDaily: mockAppendToDaily,
  readFile: mock(async () => ({ path: '', content: '', frontmatter: {} })),
  openDaily: mock(async () => undefined),
  listRecentFiles: mock(async () => []),
  listUnresolved: mock(async () => []),
  trashFile: mock(async () => undefined),
  appendToFile: mock(async () => undefined),
  replaceFileContent: mock(async () => undefined),
};

mock.module('../../ports/provider', () => ({
  getVaultOps: (): VaultOps => mockOps,
}));

const { importJson } = await import('../import-json');

// ---------------------------------------------------------------------------
// Standard VaultOps mocks for create-entity flow:
//   1. fileExists → false (absent)
//   2. listFiles → parent entry with basename + spine
//   3. createFile → ok
//   4. updateFrontmatter → ok
// ---------------------------------------------------------------------------
function setupCreateMocks(): void {
  mockFileExists.mockImplementation(async () => false);
  mockListFiles.mockImplementation(async () => [
    {
      path: 'projects/proj/PROJ.ROOT - Project.md',
      frontmatter: { spine: 'proj', children: [] },
    },
  ]);
  mockCreateFile.mockImplementation(async () => undefined);
  mockUpdateFrontmatter.mockImplementation(async () => undefined);
  mockAppendToDaily.mockImplementation(async () => undefined);
}

describe('importJson', () => {
  beforeEach(() => {
    mockFileExists.mockReset();
    mockListFiles.mockReset();
    mockCreateFile.mockReset();
    mockUpdateFrontmatter.mockReset();
    mockAppendToDaily.mockReset();
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
    mockFileExists.mockImplementation(async () => true);
    mockListFiles.mockImplementation(async () => []);
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
  test('calls updateFrontmatter for extra non-standard fields', async () => {
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
    // updateFrontmatter is called for parent children AND for extras
    const extraCall = mockUpdateFrontmatter.mock.calls.find(c => {
      const mutations = c[2] as Record<string, unknown>;
      return 'priority' in mutations;
    });
    expect(extraCall).toBeDefined();
    const mutations = extraCall![2] as Record<string, unknown>;
    expect(mutations.priority).toBe('high');
    expect(mutations.team).toBe('platform');
  });

  test('does not call updateFrontmatter for extras when there are no extra fields', async () => {
    setupCreateMocks();
    await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        { name: 'PlainNote', type: 'LEAF', kind: 'concept', spine: 'proj', parent: 'ROOT' },
      ],
    });
    // Only updateFrontmatter call should be for parent children, not for extras
    const extraCall = mockUpdateFrontmatter.mock.calls.find(c => {
      const mutations = c[2] as Record<string, unknown>;
      return 'priority' in mutations || 'team' in mutations;
    });
    expect(extraCall).toBeUndefined();
  });
});
