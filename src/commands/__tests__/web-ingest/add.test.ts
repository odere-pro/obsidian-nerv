// STORY-040 — Unit tests for web-ingest/add command
// Mocks defuddle, obsidian, and create-entity so no network or Obsidian required.

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

const mockObEval = mock(async (_vault: string, _expr: string): Promise<string> => 'NOT_FOUND');
const mockDailyAppend = mock(async (): Promise<void> => undefined);

mock.module('../../../lib/obsidian.ts', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mockObEval,
  dailyAppend: mockDailyAppend,
  rollbackLog: mock(async () => undefined),
}));

const mockFetchAndParse = mock(async (_url: string) => ({
  title: 'Test Article',
  description: 'A test article',
  content: 'Hello world content here',
  date: '2026-03-26',
}));

mock.module('../../../lib/defuddle.ts', () => ({
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

mock.module('../../create-entity.ts', () => ({
  createEntity: mockCreateEntity,
  resolveNotePath: (project: string, slug: string, title: string) =>
    `projects/${project}/${project.toUpperCase()}.${slug} - ${title}.md`,
}));

const { ingestUrl } = await import('../../web-ingest/add.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupIdempotencyMocks(existing: string | null): void {
  mockObEval.mockImplementation(async (_v: string, expr: string) => {
    // Idempotency check returns the path or NOT_FOUND
    if (expr.includes('targetUrl')) {
      return existing ?? 'NOT_FOUND';
    }
    // Frontmatter / content patches succeed
    return 'ok';
  });
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

describe('ingestUrl — URL validation', () => {
  beforeEach(() => {
    mockObEval.mockReset();
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
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
    setupIdempotencyMocks(null);
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'T',
      description: 'D',
      content: 'C',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: { created: true, path: 'projects/proj/PROJ.example-com-aaaabbbb - T.md', title: 'T' },
    });
    const result = await ingestUrl('https://example.com', 'vault', 'proj');
    expect(result.ok).toBe(true);
  });

  test('accepts http:// URLs', async () => {
    setupIdempotencyMocks(null);
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'T2',
      description: '',
      content: 'Content text',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: { created: true, path: 'projects/proj/PROJ.example-com-aaaabbbb - T2.md', title: 'T2' },
    });
    const result = await ingestUrl('http://example.com', 'vault', 'proj');
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('ingestUrl — idempotency', () => {
  beforeEach(() => {
    mockObEval.mockReset();
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
  });

  test('returns ingested:false when URL already exists', async () => {
    setupIdempotencyMocks('projects/proj/PROJ.example-com-aaaabbbb - Existing.md');
    const result = await ingestUrl('https://example.com/page', 'vault', 'proj');
    expect(result.ok).toBe(true);
    expect(result.data.ingested).toBe(false);
    expect(result.data.path).toContain('PROJ.example-com-aaaabbbb');
  });

  test('does not call defuddle on idempotent re-run', async () => {
    setupIdempotencyMocks('projects/proj/PROJ.existing.md');
    await ingestUrl('https://example.com/existing', 'vault', 'proj');
    expect(mockFetchAndParse.mock.calls.length).toBe(0);
  });

  test('does not call createEntity on idempotent re-run', async () => {
    setupIdempotencyMocks('projects/proj/PROJ.existing.md');
    await ingestUrl('https://example.com/existing', 'vault', 'proj');
    expect(mockCreateEntity.mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Network errors
// ---------------------------------------------------------------------------

describe('ingestUrl — network errors', () => {
  beforeEach(() => {
    mockObEval.mockReset();
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
  });

  test('returns ok:false on defuddle error', async () => {
    setupIdempotencyMocks(null);
    mockFetchAndParse.mockRejectedValueOnce(new Error('connection refused'));
    const result = await ingestUrl('https://unreachable.example.com', 'vault', 'proj');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network error');
    expect(result.error).toContain('connection refused');
  });

  test('does not create partial note on network error', async () => {
    setupIdempotencyMocks(null);
    mockFetchAndParse.mockRejectedValueOnce(new Error('timeout'));
    await ingestUrl('https://slow.example.com', 'vault', 'proj');
    expect(mockCreateEntity.mock.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// JSON output schema
// ---------------------------------------------------------------------------

describe('ingestUrl — JSON output schema', () => {
  beforeEach(() => {
    mockObEval.mockReset();
    mockFetchAndParse.mockReset();
    mockCreateEntity.mockReset();
  });

  test('successful ingest returns full schema', async () => {
    setupIdempotencyMocks(null);
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'My Article',
      description: 'desc',
      content: 'word1 word2 word3 word4 word5',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: {
        created: true,
        path: 'projects/proj/PROJ.example-com-aaaabbbb - My Article.md',
        title: 'My Article',
      },
    });

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

  test('tokenEstimate is ≥ wordCount', async () => {
    setupIdempotencyMocks(null);
    mockFetchAndParse.mockResolvedValueOnce({
      title: 'T',
      description: '',
      content: 'one two three four five six seven',
    });
    mockCreateEntity.mockResolvedValueOnce({
      ok: true,
      data: { created: true, path: 'projects/proj/PROJ.x - T.md', title: 'T' },
    });

    const result = await ingestUrl('https://example.com/t', 'vault', 'proj');
    expect(result.data.tokenEstimate).toBeGreaterThanOrEqual(result.data.wordCount);
  });
});
