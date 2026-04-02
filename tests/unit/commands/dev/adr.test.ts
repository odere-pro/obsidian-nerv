// Mocks createEntity and uses MockVaultOps so no Obsidian instance is required.

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as provider from '../../../../src/ports/provider';
import { MockVaultOps } from '../../../../src/ports/mock-vault-ops';

// ---------------------------------------------------------------------------
// Mock create-entity before importing adr
// ---------------------------------------------------------------------------
const mockCreateEntity = mock(async (params: { title: string }) => ({
  ok: true,
  data: {
    created: true,
    path: `projects/proj/PROJ.adr-stub - ${params.title}.md`,
    title: params.title,
  },
}));

// Path resolves from this test file up to src/commands/create-entity
mock.module('../../../../src/commands/create-entity', () => ({
  createEntity: mockCreateEntity,
  resolveNotePath: (project: string, slug: string, title: string) =>
    `projects/${project}/${project.toUpperCase()}.${slug} - ${title}.md`,
}));

const { generateAdrSlug, createAdr, patchAdrContent } =
  await import('../../../../src/commands/dev/adr');

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
// createAdr tests (with MockVaultOps)
// ---------------------------------------------------------------------------

describe('createAdr', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    mockCreateEntity.mockReset();
    mockCreateEntity.mockImplementation(async (params: { title: string }) => ({
      ok: true,
      data: {
        created: true,
        path: `projects/proj/PROJ.adr-stub - ${params.title}.md`,
        title: params.title,
      },
    }));
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
  });

  afterEach(() => {
    mock.restore();
  });

  test('calls createEntity with kind: decision', async () => {
    mockOps.seedFile(
      'v',
      'projects/proj/PROJ.adr-stub - Use Event Sourcing.md',
      '---\n---\n## Content\n',
      {}
    );
    await createAdr({ vault: 'v', project: 'proj', title: 'Use Event Sourcing' });
    expect(mockCreateEntity.mock.calls[0][0]).toMatchObject({ kind: 'decision' });
  });

  test('updates frontmatter with decision-date and decision-status', async () => {
    const path = 'projects/proj/PROJ.adr-stub - Some Decision.md';
    mockOps.seedFile('v', path, '---\n---\n## Content\n', {});
    await createAdr({ vault: 'v', project: 'proj', title: 'Some Decision' });
    const file = await mockOps.readFile('v', path);
    expect(file.frontmatter).toMatchObject({ 'decision-status': 'proposed' });
    expect(file.frontmatter).toHaveProperty('decision-date');
  });

  test('patches content with ADR subsections', async () => {
    const path = 'projects/proj/PROJ.adr-stub - Some Decision.md';
    mockOps.seedFile('v', path, '---\n---\n## Content\n', {});
    await createAdr({ vault: 'v', project: 'proj', title: 'Some Decision' });
    const file = await mockOps.readFile('v', path);
    expect(file.content).toContain('### Context');
    expect(file.content).toContain('### Decision');
    expect(file.content).toContain('### Consequences');
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
    mockOps.seedFile(
      'v',
      'projects/proj/PROJ.adr-stub - Default Parent.md',
      '---\n---\n## Content\n',
      {}
    );
    await createAdr({ vault: 'v', project: 'proj', title: 'Default Parent' });
    expect(mockCreateEntity.mock.calls[0][0]).toMatchObject({ parentSlug: 'ROOT' });
  });

  test('returns ok:false when updateFrontmatter throws', async () => {
    // Don't seed file — MockVaultOps.updateFrontmatter throws "file not found"
    const result = await createAdr({ vault: 'v', project: 'proj', title: 'Fail FM' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('could not patch frontmatter');
  });

  test('returns ok:false when readFile throws', async () => {
    const path = 'projects/proj/PROJ.adr-stub - Fail Read.md';
    mockOps.seedFile('v', path, '---\n---\n## Content\n', {});
    // Spy on readFile to throw after updateFrontmatter succeeds
    spyOn(mockOps, 'readFile').mockRejectedValue(new Error('read failed'));
    const result = await createAdr({ vault: 'v', project: 'proj', title: 'Fail Read' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('could not patch Content sections');
  });
});
