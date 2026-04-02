// Mocks defuddle and create-entity; uses MockVaultOps for vault state.
// No network or Obsidian instance required.

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as provider from '../../../../src/ports/provider';
import { MockVaultOps } from '../../../../src/ports/mock-vault-ops';

// ---------------------------------------------------------------------------
// Mock defuddle and create-entity (not obsidian or provider)
// ---------------------------------------------------------------------------

const mockFetchAndParse = mock(async (_url: string) => ({
  title: 'Test Article',
  description: 'A test article',
  content: 'Hello world content here',
  date: '2026-03-26',
}));

mock.module('../../../../src/lib/defuddle', () => ({
  fetchAndParse: mockFetchAndParse,
  generateUrlSlug: (url: string) => {
    // Deterministic stub: domain + fixed hash
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/[^a-z0-9]/g, '-') + '-aaaabbbb';
    } catch {
      return 'unknown-aaaabbbb';
    }
  },
}));

const mockCreateEntity = mock(async (params: { title: string; slug: string; project: string }) => ({
  ok: true,
  data: {
    created: true,
    path: `projects/${params.project}/${params.project.toUpperCase()}.${params.slug} - ${params.title}.md`,
    title: params.title,
  },
}));

mock.module('../../../../src/commands/create-entity', () => ({
  createEntity: mockCreateEntity,
  resolveNotePath: (project: string, slug: string, title: string) =>
    `projects/${project}/${project.toUpperCase()}.${slug} - ${title}.md`,
}));

const { ingestUrl } = await import('../../../../src/commands/web-ingest/add');

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

describe('ingestUrl — URL validation', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
  });

  afterEach(() => {
    mock.restore();
  });

  test('rejects URLs without http/https scheme', async () => {
    const result = await ingestUrl('ftp://example.com', 'vault', 'proj');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid URL');
  });

  test('rejects empty string', async () => {
    const result = await ingestUrl('', 'vault', 'proj');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid URL');
  });

  test('rejects file:// URLs', async () => {
    const result = await ingestUrl('file:///etc/passwd', 'vault', 'proj');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid URL');
  });

  test('accepts https:// URLs', async () => {
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'T',
      description: 'D',
      content: 'C',
      date: '2026-03-30',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: { created: true, path: 'projects/proj/PROJ.example-com-aaaabbbb - T.md', title: 'T' },
    });
    // Seed the file so post-creation patching works
    mockOps.seedFile(
      'vault',
      'projects/proj/PROJ.example-com-aaaabbbb - T.md',
      '---\n---\n## Content\n',
      {}
    );
    const result = await ingestUrl('https://example.com', 'vault', 'proj');
    expect(result.ok).toBe(true);
  });

  test('accepts http:// URLs', async () => {
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'T2',
      description: '',
      content: 'Content text',
      date: '2026-03-30',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: { created: true, path: 'projects/proj/PROJ.example-com-aaaabbbb - T2.md', title: 'T2' },
    });
    mockOps.seedFile(
      'vault',
      'projects/proj/PROJ.example-com-aaaabbbb - T2.md',
      '---\n---\n## Content\n',
      {}
    );
    const result = await ingestUrl('http://example.com', 'vault', 'proj');
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('ingestUrl — idempotency', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
  });

  afterEach(() => {
    mock.restore();
  });

  test('returns ingested:false when URL already exists', async () => {
    // Seed a note with matching url frontmatter
    mockOps.seedFile('vault', 'projects/proj/PROJ.example-com-aaaabbbb - Existing.md', '', {
      url: 'https://example.com/page',
    });
    const result = await ingestUrl('https://example.com/page', 'vault', 'proj');
    expect(result.ok).toBe(true);
    expect(result.data.ingested).toBe(false);
    expect(result.data.path).toContain('PROJ.example-com-aaaabbbb');
  });

  test('does not call defuddle on idempotent re-run', async () => {
    mockOps.seedFile('vault', 'projects/proj/PROJ.existing.md', '', {
      url: 'https://example.com/existing',
    });
    await ingestUrl('https://example.com/existing', 'vault', 'proj');
    expect(mockFetchAndParse.mock.calls.length).toBe(0);
  });

  test('does not call createEntity on idempotent re-run', async () => {
    mockOps.seedFile('vault', 'projects/proj/PROJ.existing.md', '', {
      url: 'https://example.com/existing',
    });
    await ingestUrl('https://example.com/existing', 'vault', 'proj');
    expect(mockCreateEntity.mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Network errors
// ---------------------------------------------------------------------------

describe('ingestUrl — network errors', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
  });

  afterEach(() => {
    mock.restore();
  });

  test('returns ok:false on defuddle error', async () => {
    mockFetchAndParse.mockRejectedValueOnce(new Error('connection refused'));
    const result = await ingestUrl('https://unreachable.example.com', 'vault', 'proj');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network error');
    expect(result.error).toContain('connection refused');
  });

  test('does not create partial note on network error', async () => {
    mockFetchAndParse.mockRejectedValueOnce(new Error('timeout'));
    await ingestUrl('https://slow.example.com', 'vault', 'proj');
    expect(mockCreateEntity.mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// JSON output schema
// ---------------------------------------------------------------------------

describe('ingestUrl — JSON output schema', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
  });

  afterEach(() => {
    mock.restore();
  });

  test('successful ingest returns full schema', async () => {
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'My Article',
      description: 'desc',
      content: 'word1 word2 word3 word4 word5',
      date: '2026-03-30',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: {
        created: true,
        path: 'projects/proj/PROJ.example-com-aaaabbbb - My Article.md',
        title: 'My Article',
      },
    });
    mockOps.seedFile(
      'vault',
      'projects/proj/PROJ.example-com-aaaabbbb - My Article.md',
      '---\n---\n## Content\n',
      {}
    );

    const result = await ingestUrl('https://example.com/article', 'vault', 'proj');
    expect(result.ok).toBe(true);
    expect(typeof result.data.ingested).toBe('boolean');
    expect(typeof result.data.path).toBe('string');
    expect(typeof result.data.title).toBe('string');
    expect(typeof result.data.url).toBe('string');
    expect(typeof result.data.wordCount).toBe('number');
    expect(typeof result.data.tokenEstimate).toBe('number');
    expect(result.data.ingested).toBe(true);
    expect(result.data.wordCount).toBe(5);
    expect(result.data.tokenEstimate).toBeGreaterThan(0);
  });

  test('tokenEstimate is >= wordCount', async () => {
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'T',
      description: '',
      content: 'one two three four five six seven',
      date: '2026-03-30',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: { created: true, path: 'projects/proj/PROJ.x - T.md', title: 'T' },
    });
    mockOps.seedFile('vault', 'projects/proj/PROJ.x - T.md', '---\n---\n## Content\n', {});

    const result = await ingestUrl('https://example.com/t', 'vault', 'proj');
    expect(result.data.tokenEstimate).toBeGreaterThanOrEqual(result.data.wordCount);
  });
});
