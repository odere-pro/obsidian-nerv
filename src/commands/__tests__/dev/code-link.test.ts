// Tests CODEPATH validation, idempotency logic, and VaultOps integration.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { VaultOps } from '../../../ports/vault-ops';
import { setVaultOps } from '../../../ports/provider';

// ---------------------------------------------------------------------------
// Mock obsidian (only resolveVault needed)
// ---------------------------------------------------------------------------
mock.module('../../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
}));

const { validateCodePath, codeLink, appendCodeLink } = await import('../../dev/code-link');

// ---------------------------------------------------------------------------
// Inline mock VaultOps
// ---------------------------------------------------------------------------
const mockReadFile = mock(async () => ({
  path: 'projects/p/note.md',
  content: '---\n---\n## Connections\n\n## References\n',
  frontmatter: {},
}));
const mockReplaceFileContent = mock(async () => {});

function createMockOps(): VaultOps {
  return {
    fileExists: mock(async () => false),
    readFile: mockReadFile,
    createFile: mock(async () => {}),
    updateFrontmatter: mock(async () => {}),
    listFiles: mock(async () => []),
    appendToDaily: mock(async () => {}),
    openDaily: mock(async () => {}),
    listRecentFiles: mock(async () => []),
    listUnresolved: mock(async () => []),
    trashFile: mock(async () => {}),
    appendToFile: mock(async () => {}),
    replaceFileContent: mockReplaceFileContent,
  } as VaultOps;
}

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe('validateCodePath', () => {
  test('accepts a valid code path', () => {
    expect(validateCodePath('src/commands/create-entity')).toBeNull();
  });

  test('rejects code path containing ]]', () => {
    const err = validateCodePath('src/foo]]bar');
    expect(err).not.toBeNull();
    expect(err).toContain(']]');
  });

  test('rejects code path containing newline', () => {
    const err = validateCodePath('src/foo\nbar');
    expect(err).not.toBeNull();
    expect(err).toContain('newline');
  });

  test('rejects code path containing carriage return', () => {
    const err = validateCodePath('src/foo\rbar');
    expect(err).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// appendCodeLink pure function tests
// ---------------------------------------------------------------------------

describe('appendCodeLink', () => {
  test('appends code link before next section', () => {
    const content = '---\n---\n## Connections\n\n## References\n';
    const result = appendCodeLink(content, 'src/foo');
    expect(result.appended).toBe(true);
    expect(result.content).toContain('- implements :: `src/foo`');
    expect(result.content).toContain('## References');
  });

  test('appends at end when no next section', () => {
    const content = '---\n---\n## Connections\n';
    const result = appendCodeLink(content, 'src/bar');
    expect(result.appended).toBe(true);
    expect(result.content).toContain('- implements :: `src/bar`');
  });

  test('returns appended:false when code path already present', () => {
    const content = '---\n---\n## Connections\n- implements :: `src/foo`\n\n## References\n';
    const result = appendCodeLink(content, 'src/foo');
    expect(result.appended).toBe(false);
    expect(result.content).toBe(content);
  });

  test('returns appended:false when no ## Connections marker', () => {
    const content = '---\n---\nNo connections section\n';
    const result = appendCodeLink(content, 'src/foo');
    expect(result.appended).toBe(false);
    expect(result.content).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// codeLink tests (with mocked VaultOps)
// ---------------------------------------------------------------------------

describe('codeLink', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockReplaceFileContent.mockReset();
    mockReadFile.mockImplementation(async () => ({
      path: 'projects/p/note.md',
      content: '---\n---\n## Connections\n\n## References\n',
      frontmatter: {},
    }));
    mockReplaceFileContent.mockImplementation(async () => {});
    setVaultOps(createMockOps());
  });

  test('returns ok:false for invalid code path with ]]', async () => {
    const result = await codeLink('v', 'projects/p/note.md', 'src/bad]]path');
    expect(result.ok).toBe(false);
    expect(result.error).toContain(']]');
  });

  test('returns ok:false for code path with newline', async () => {
    const result = await codeLink('v', 'projects/p/note.md', 'src/bad\npath');
    expect(result.ok).toBe(false);
  });

  test('returns appended:true when code link is new', async () => {
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(true);
    expect(mockReplaceFileContent).toHaveBeenCalledTimes(1);
    const call = mockReplaceFileContent.mock.calls[0] as unknown as [string, string, string];
    expect(call[2]).toContain('- implements :: `src/foo`');
  });

  test('returns appended:false when code path already present (idempotent)', async () => {
    mockReadFile.mockImplementation(async () => ({
      path: 'projects/p/note.md',
      content: '---\n---\n## Connections\n- implements :: `src/foo`\n\n## References\n',
      frontmatter: {},
    }));
    setVaultOps(createMockOps());
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(false);
    expect(mockReplaceFileContent).not.toHaveBeenCalled();
  });

  test('returns ok:false when readFile throws (note not found)', async () => {
    mockReadFile.mockImplementation(async () => {
      throw new Error('not found');
    });
    setVaultOps(createMockOps());
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('note not found');
  });
});
