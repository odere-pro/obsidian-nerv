// Mocks createEntity and VaultOps so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { VaultOps } from '../../../ports/vault-ops';
import { setVaultOps } from '../../../ports/provider';

// ---------------------------------------------------------------------------
// Mock create-entity before importing adr
// ---------------------------------------------------------------------------
mock.module('../../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
}));

const mockCreateEntity = mock(async (params: { title: string }) => ({
  ok: true,
  data: {
    created: true,
    path: `projects/proj/PROJ.adr-stub - ${params.title}.md`,
    title: params.title,
  },
}));

// Path resolves from this test file up to src/commands/create-entity
mock.module('../../create-entity', () => ({
  createEntity: mockCreateEntity,
  resolveNotePath: (project: string, slug: string, title: string) =>
    `projects/${project}/${project.toUpperCase()}.${slug} - ${title}.md`,
}));

const { generateAdrSlug, createAdr, patchAdrContent } = await import('../../dev/adr');

// ---------------------------------------------------------------------------
// Inline mock VaultOps
// ---------------------------------------------------------------------------
const mockUpdateFrontmatter = mock(async () => {});
const mockReadFile = mock(async () => ({
  path: 'test.md',
  content: '---\n---\n## Content\n',
  frontmatter: {},
}));
const mockReplaceFileContent = mock(async () => {});

function createMockOps(): VaultOps {
  return {
    fileExists: mock(async () => false),
    readFile: mockReadFile,
    createFile: mock(async () => {}),
    updateFrontmatter: mockUpdateFrontmatter,
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
// Slug generation tests
// ---------------------------------------------------------------------------

describe('generateAdrSlug', () => {
  test('generates slug with adr- prefix and 8-digit date', () => {
    const slug = generateAdrSlug('My Decision');
    expect(slug).toMatch(/^adr-\d{8}-/);
    expect(slug).toContain('my-decision');
  });

  test('lowercases and replaces spaces with hyphens', () => {
    const slug = generateAdrSlug('Use Event Sourcing');
    expect(slug).toContain('use-event-sourcing');
  });

  test('strips non-alphanumeric special characters', () => {
    const slug = generateAdrSlug('ADR: Use PostgreSQL (v14)!');
    expect(slug).toMatch(/^adr-\d{8}-[a-z0-9-]+$/);
    expect(slug).not.toMatch(/[:!()]/);
  });

  test('collapses consecutive hyphens', () => {
    const slug = generateAdrSlug('Foo -- Bar');
    expect(slug).not.toMatch(/-{2,}/);
  });

  test('strips unicode characters leaving only ascii', () => {
    const slug = generateAdrSlug('Décision über alles');
    expect(slug).toMatch(/^adr-\d{8}-[a-z0-9-]*$/);
  });

  test('long title produces valid slug with no spaces', () => {
    const slug = generateAdrSlug(
      'A Very Long Architecture Decision Record Title That Goes On And On'
    );
    expect(slug).not.toContain(' ');
    expect(slug).toMatch(/^adr-\d{8}-[a-z0-9-]+$/);
  });
});

// ---------------------------------------------------------------------------
// patchAdrContent tests
// ---------------------------------------------------------------------------

describe('patchAdrContent', () => {
  test('inserts ADR subsections after ## Content marker', () => {
    const content = '---\n---\n## Content\n\n## References\n';
    const patched = patchAdrContent(content);
    expect(patched).toContain('### Context');
    expect(patched).toContain('### Decision');
    expect(patched).toContain('### Consequences');
    expect(patched).toContain('## References');
  });

  test('returns content unchanged if ### Context already exists', () => {
    const content = '---\n---\n## Content\n\n### Context\nAlready here\n';
    const patched = patchAdrContent(content);
    expect(patched).toBe(content);
  });

  test('returns content unchanged if ## Content marker is missing', () => {
    const content = '---\n---\nNo content section\n';
    const patched = patchAdrContent(content);
    expect(patched).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// createAdr tests
// ---------------------------------------------------------------------------

describe('createAdr', () => {
  beforeEach(() => {
    mockUpdateFrontmatter.mockReset();
    mockReadFile.mockReset();
    mockReplaceFileContent.mockReset();
    mockCreateEntity.mockReset();

    mockUpdateFrontmatter.mockImplementation(async () => {});
    mockReadFile.mockImplementation(async () => ({
      path: 'test.md',
      content: '---\n---\n## Content\n',
      frontmatter: {},
    }));
    mockReplaceFileContent.mockImplementation(async () => {});
    mockCreateEntity.mockImplementation(async (params: { title: string }) => ({
      ok: true,
      data: {
        created: true,
        path: `projects/proj/PROJ.adr-stub - ${params.title}.md`,
        title: params.title,
      },
    }));

    setVaultOps(createMockOps());
  });

  test('calls createEntity with kind: decision', async () => {
    await createAdr({ vault: 'v', project: 'proj', title: 'Use Event Sourcing' });
    expect(mockCreateEntity.mock.calls[0][0]).toMatchObject({ kind: 'decision' });
  });

  test('calls updateFrontmatter with decision-date and decision-status', async () => {
    await createAdr({ vault: 'v', project: 'proj', title: 'Some Decision' });
    expect(mockUpdateFrontmatter).toHaveBeenCalledTimes(1);
    const call = mockUpdateFrontmatter.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(call[2]).toMatchObject({ 'decision-status': 'proposed' });
    expect(call[2]).toHaveProperty('decision-date');
  });

  test('calls replaceFileContent with patched ADR content', async () => {
    await createAdr({ vault: 'v', project: 'proj', title: 'Some Decision' });
    expect(mockReplaceFileContent).toHaveBeenCalledTimes(1);
    const call = mockReplaceFileContent.mock.calls[0] as unknown as [string, string, string];
    const newContent = call[2];
    expect(newContent).toContain('### Context');
    expect(newContent).toContain('### Decision');
    expect(newContent).toContain('### Consequences');
  });

  test('returns ok:false when createEntity fails', async () => {
    mockCreateEntity.mockImplementation(async () => ({
      ok: false,
      data: { created: false, path: '', title: '' },
      error: 'entity creation failed',
    }));
    const result = await createAdr({ vault: 'v', project: 'proj', title: 'Bad' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('entity creation failed');
  });

  test('uses ROOT as default parentSlug when not provided', async () => {
    await createAdr({ vault: 'v', project: 'proj', title: 'Default Parent' });
    expect(mockCreateEntity.mock.calls[0][0]).toMatchObject({ parentSlug: 'ROOT' });
  });

  test('returns ok:false when updateFrontmatter throws', async () => {
    mockUpdateFrontmatter.mockImplementation(async () => {
      throw new Error('frontmatter failed');
    });
    const result = await createAdr({ vault: 'v', project: 'proj', title: 'Fail FM' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('could not patch frontmatter');
  });

  test('returns ok:false when readFile throws', async () => {
    mockReadFile.mockImplementation(async () => {
      throw new Error('read failed');
    });
    const result = await createAdr({ vault: 'v', project: 'proj', title: 'Fail Read' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('could not patch Content sections');
  });
});
