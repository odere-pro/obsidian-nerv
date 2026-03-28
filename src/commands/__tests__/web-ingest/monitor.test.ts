// Tests RSS/Atom parsing, state management helpers, and article filtering.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { VaultOps } from '../../../ports/vault-ops';

// ---------------------------------------------------------------------------
// Mock VaultOps
// ---------------------------------------------------------------------------

let mockOps: VaultOps;

function resetMockOps(): void {
  mockOps = {
    fileExists: mock(async () => false),
    readFile: mock(async (_v: string, p: string) => ({ path: p, content: '', frontmatter: {} })),
    createFile: mock(async () => undefined),
    updateFrontmatter: mock(async () => undefined),
    listFiles: mock(async () => []),
    appendToDaily: mock(async () => undefined),
    openDaily: mock(async () => undefined),
    listRecentFiles: mock(async () => []),
    listUnresolved: mock(async () => []),
    trashFile: mock(async () => undefined),
    appendToFile: mock(async () => undefined),
    replaceFileContent: mock(async () => undefined),
  };
}

resetMockOps();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

mock.module('../../../ports/provider', () => ({
  getVaultOps: () => mockOps,
  setVaultOps: () => undefined,
  getDevOps: () => ({}),
  setDevOps: () => undefined,
}));

mock.module('../../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mock(async () => ''),
  dailyAppend: mock(async () => undefined),
  rollbackLog: mock(async () => undefined),
}));

mock.module('../../web-ingest/add', () => ({
  ingestUrl: mock(async (url: string) => ({
    ok: true as const,
    data: { ingested: true, path: `proj/${url}`, title: 'T', url, wordCount: 5, tokenEstimate: 7 },
  })),
}));

const { parseFeed, loadState, saveState } = await import('../../web-ingest/monitor');

// ---------------------------------------------------------------------------
// parseFeed — RSS 2.0
// ---------------------------------------------------------------------------

describe('parseFeed — RSS 2.0', () => {
  const rssFeed = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>My Blog</title>
    <item>
      <title>First Post</title>
      <link>https://blog.example.com/first</link>
      <pubDate>Wed, 25 Mar 2026 10:00:00 +0000</pubDate>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://blog.example.com/second</link>
      <pubDate>Thu, 26 Mar 2026 10:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;

  test('parses two items from RSS feed', () => {
    const articles = parseFeed(rssFeed);
    expect(articles.length).toBe(2);
  });

  test('extracts title from RSS item', () => {
    const articles = parseFeed(rssFeed);
    expect(articles[0].title).toBe('First Post');
  });

  test('extracts URL from <link> element', () => {
    const articles = parseFeed(rssFeed);
    expect(articles[0].url).toBe('https://blog.example.com/first');
  });

  test('extracts pubDate from RSS item', () => {
    const articles = parseFeed(rssFeed);
    expect(articles[0].pubDate).toBeDefined();
    expect(articles[0].pubDate).toContain('Mar 2026');
  });
});

// ---------------------------------------------------------------------------
// parseFeed — Atom
// ---------------------------------------------------------------------------

describe('parseFeed — Atom', () => {
  const atomFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <entry>
    <title>Atom Article One</title>
    <link href="https://atom.example.com/one"/>
    <updated>2026-03-25T10:00:00Z</updated>
  </entry>
  <entry>
    <title>Atom Article Two</title>
    <link href="https://atom.example.com/two"/>
    <updated>2026-03-26T10:00:00Z</updated>
  </entry>
</feed>`;

  test('parses two entries from Atom feed', () => {
    const articles = parseFeed(atomFeed);
    expect(articles.length).toBe(2);
  });

  test('extracts title from Atom entry', () => {
    const articles = parseFeed(atomFeed);
    expect(articles[0].title).toBe('Atom Article One');
  });

  test('extracts URL from Atom <link href="..."/>', () => {
    const articles = parseFeed(atomFeed);
    expect(articles[0].url).toBe('https://atom.example.com/one');
  });

  test('extracts updated date from Atom entry', () => {
    const articles = parseFeed(atomFeed);
    expect(articles[0].pubDate).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// State file management
// ---------------------------------------------------------------------------

describe('loadState', () => {
  beforeEach(() => {
    resetMockOps();
  });

  test('returns default state when file not found', async () => {
    (mockOps.fileExists as ReturnType<typeof mock>).mockResolvedValueOnce(false);
    const state = await loadState('vault', mockOps);
    expect(state.seenUrls).toEqual([]);
    expect(typeof state.lastChecked).toBe('string');
  });

  test('returns default state on malformed JSON', async () => {
    (mockOps.fileExists as ReturnType<typeof mock>).mockResolvedValueOnce(true);
    (mockOps.readFile as ReturnType<typeof mock>).mockResolvedValueOnce({
      path: '_inbox/_web-ingest-state.json',
      content: '{ broken json',
      frontmatter: {},
    });
    const state = await loadState('vault', mockOps);
    expect(state.seenUrls).toEqual([]);
  });

  test('returns parsed state when file exists', async () => {
    const stored = JSON.stringify({
      lastChecked: '2026-03-20T00:00:00.000Z',
      seenUrls: ['https://a.com', 'https://b.com'],
    });
    (mockOps.fileExists as ReturnType<typeof mock>).mockResolvedValueOnce(true);
    (mockOps.readFile as ReturnType<typeof mock>).mockResolvedValueOnce({
      path: '_inbox/_web-ingest-state.json',
      content: stored,
      frontmatter: {},
    });
    const state = await loadState('vault', mockOps);
    expect(state.seenUrls).toHaveLength(2);
    expect(state.lastChecked).toBe('2026-03-20T00:00:00.000Z');
  });
});

describe('saveState', () => {
  beforeEach(() => {
    resetMockOps();
  });

  test('creates file when state file does not exist', async () => {
    (mockOps.fileExists as ReturnType<typeof mock>).mockResolvedValueOnce(false);
    await saveState(
      'vault',
      { lastChecked: '2026-03-26T00:00:00.000Z', seenUrls: ['https://x.com'] },
      mockOps
    );
    expect((mockOps.createFile as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    const content = (mockOps.createFile as ReturnType<typeof mock>).mock.calls[0][2] as string;
    expect(content).toContain('https://x.com');
  });

  test('replaces file when state file exists', async () => {
    (mockOps.fileExists as ReturnType<typeof mock>).mockResolvedValueOnce(true);
    await saveState(
      'vault',
      {
        lastChecked: '2026-03-26T00:00:00.000Z',
        seenUrls: ['https://seen1.com', 'https://seen2.com'],
      },
      mockOps
    );
    expect((mockOps.replaceFileContent as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    const content = (mockOps.replaceFileContent as ReturnType<typeof mock>).mock
      .calls[0][2] as string;
    expect(content).toContain('seen1.com');
    expect(content).toContain('seen2.com');
  });
});
