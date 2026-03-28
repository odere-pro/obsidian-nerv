// Mocks VaultOps so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { VaultOps } from '../../ports/vault-ops';
import type { VaultFile } from '../../ports/vault-ops';

// ---------------------------------------------------------------------------
// Mock obsidian (for resolveVault) and provider (for VaultOps)
// ---------------------------------------------------------------------------
mock.module('../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
}));

const mockFileExists = mock(async (_v: string, _p: string): Promise<boolean> => true);
const mockReadFile = mock(
  async (_v: string, _p: string): Promise<VaultFile> => ({
    path: '',
    content: '',
    frontmatter: {},
  })
);
const mockReplaceFileContent = mock(
  async (_v: string, _p: string, _c: string): Promise<void> => undefined
);

const mockOps: VaultOps = {
  fileExists: mockFileExists,
  readFile: mockReadFile,
  replaceFileContent: mockReplaceFileContent,
  createFile: mock(async () => undefined),
  updateFrontmatter: mock(async () => undefined),
  listFiles: mock(async () => []),
  appendToDaily: mock(async () => undefined),
  openDaily: mock(async () => undefined),
  listRecentFiles: mock(async () => []),
  listUnresolved: mock(async () => []),
  trashFile: mock(async () => undefined),
  appendToFile: mock(async () => undefined),
};

mock.module('../../ports/provider', () => ({
  getVaultOps: (): VaultOps => mockOps,
}));

const { addConnection } = await import('../add-connection');

// Standard ontology content with rel-type table
const ontologyContent = [
  '| rel_type | description | inverse | symmetric |',
  '| --- | --- | --- | --- |',
  '| `depends-on` | A depends on B | `depended-by` | |',
  '| `compares-to` | A compares to B | `compares-to` | yes |',
].join('\n');

// Source/target file content with ## Connections section
function noteContent(existingConnections: string[] = []): string {
  const connLines = existingConnections.map(c => `- ${c}`).join('\n');
  return `---\ntitle: Test\n---\n\n## Body\n\nSome content.\n\n## Connections\n${connLines ? connLines + '\n' : ''}\n## Notes\n`;
}

function setupMocks(opts: {
  sourceContent?: string;
  targetContent?: string;
  ontology?: string;
  sourceExists?: boolean;
  targetExists?: boolean;
}): void {
  const sourceContent = opts.sourceContent ?? noteContent();
  const targetContent = opts.targetContent ?? noteContent();
  const ontology = opts.ontology ?? ontologyContent;

  mockFileExists.mockImplementation(async (_v: string, path: string) => {
    if (path.includes('PROJ.a')) return opts.sourceExists ?? true;
    if (path.includes('PROJ.b')) return opts.targetExists ?? true;
    return true;
  });

  mockReadFile.mockImplementation(async (_v: string, path: string) => {
    if (path.includes('_ontology')) {
      return { path, content: ontology, frontmatter: {} };
    }
    if (path.includes('PROJ.a')) {
      return { path, content: sourceContent, frontmatter: {} };
    }
    return { path, content: targetContent, frontmatter: {} };
  });

  mockReplaceFileContent.mockImplementation(async () => undefined);
}

describe('addConnection', () => {
  beforeEach(() => {
    mockFileExists.mockReset();
    mockReadFile.mockReset();
    mockReplaceFileContent.mockReset();
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------
  test('returns forwardWritten:skipped when connection already exists', async () => {
    setupMocks({
      sourceContent: noteContent(['depends-on :: [[PROJ.b - B|B]]']),
    });
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
    setupMocks({});
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.forwardWritten).toBe(true);
    expect(result.data.inverseWritten).toBe(true);
    // replaceFileContent should be called twice (forward + inverse)
    expect(mockReplaceFileContent).toHaveBeenCalledTimes(2);
  });

  test('handles symmetric relationship (inverseType equals relType)', async () => {
    setupMocks({});
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
    const sevenConns = Array.from(
      { length: 7 },
      (_, i) => `depends-on :: [[PROJ.x${i} - X${i}|X${i}]]`
    );
    setupMocks({ sourceContent: noteContent(sevenConns) });
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
    const sevenConns = Array.from(
      { length: 7 },
      (_, i) => `depended-by :: [[PROJ.x${i} - X${i}|X${i}]]`
    );
    setupMocks({ targetContent: noteContent(sevenConns) });
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.forwardWritten).toBe(true);
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
