// STORY-037 — Unit tests for dev/adr command
// Mocks createEntity and obEval so no Obsidian instance is required.

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock obsidian and create-entity before importing adr
// ---------------------------------------------------------------------------
const mockObEval = mock(async (_vault: string, _expr: string): Promise<string> => 'ok');

mock.module('../../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mockObEval,
  dailyAppend: mock(async () => undefined),
  rollbackLog: mock(async () => undefined),
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

const { generateAdrSlug, createAdr } = await import('../../dev/adr');

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
// createAdr tests
// ---------------------------------------------------------------------------

describe('createAdr', () => {
  beforeEach(() => {
    mockObEval.mockReset();
    mockCreateEntity.mockReset();
    mockObEval.mockImplementation(async () => 'ok');
    mockCreateEntity.mockImplementation(async (params: { title: string }) => ({
      ok: true,
      data: {
        created: true,
        path: `projects/proj/PROJ.adr-stub - ${params.title}.md`,
        title: params.title,
      },
    }));
  });

  test('calls createEntity with kind: decision', async () => {
    await createAdr({ vault: 'v', project: 'proj', title: 'Use Event Sourcing' });
    expect(mockCreateEntity.mock.calls[0][0]).toMatchObject({ kind: 'decision' });
  });

  test('frontmatter patch call includes decision-status proposed', async () => {
    await createAdr({ vault: 'v', project: 'proj', title: 'Some Decision' });
    const patchCall = mockObEval.mock.calls.find(c => (c[1] as string).includes("'proposed'"));
    expect(patchCall).toBeDefined();
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
});
