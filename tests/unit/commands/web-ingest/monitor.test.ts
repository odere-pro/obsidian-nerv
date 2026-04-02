// Tests RSS/Atom parsing, state management helpers, and article filtering.
// Uses MockVaultOps for stateful vault assertions.

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { MockVaultOps } from '../../../../src/ports/mock-vault-ops';

// ---------------------------------------------------------------------------
// Mock web-ingest/add (needed for monitor.ts import chain)
// ---------------------------------------------------------------------------
mock.module('../../../../src/commands/web-ingest/add', () => ({
  ingestUrl: mock(async (url: string) => ({
    ok: true as const,
    data: { ingested: true, path: `proj/${url}`, title: 'T', url, wordCount: 5, tokenEstimate: 7 },
  })),
}));

const { parseFeed, loadState, saveState } =
  await import('../../../../src/commands/web-ingest/monitor');

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
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
  });

  test('returns default state when file not found', async () => {
    const state = await loadState('vault', mockOps);
    expect(state.seenUrls).toEqual([]);
    expect(typeof state.lastChecked).toBe('string');
  });

  test('returns default state on malformed JSON', async () => {
    mockOps.seedFile('vault', '_inbox/_web-ingest-state.json', '{ broken json', {});
    const state = await loadState('vault', mockOps);
    expect(state.seenUrls).toEqual([]);
  });

  test('returns parsed state when file exists', async () => {
    const stored = JSON.stringify({
      lastChecked: '2026-03-20T00:00:00.000Z',
      seenUrls: ['https://a.com', 'https://b.com'],
    });
    mockOps.seedFile('vault', '_inbox/_web-ingest-state.json', stored, {});
    const state = await loadState('vault', mockOps);
    expect(state.seenUrls).toHaveLength(2);
    expect(state.lastChecked).toBe('2026-03-20T00:00:00.000Z');
  });
});

describe('saveState', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
  });

  test('creates file when state file does not exist', async () => {
    await saveState(
      'vault',
      { lastChecked: '2026-03-26T00:00:00.000Z', seenUrls: ['https://x.com'] },
      mockOps
    );
    const file = await mockOps.readFile('vault', '_inbox/_web-ingest-state.json');
    expect(file.content).toContain('https://x.com');
  });

  test('replaces file when state file exists', async () => {
    mockOps.seedFile('vault', '_inbox/_web-ingest-state.json', '{}', {});
    await saveState(
      'vault',
      {
        lastChecked: '2026-03-26T00:00:00.000Z',
        seenUrls: ['https://seen1.com', 'https://seen2.com'],
      },
      mockOps
    );
    const file = await mockOps.readFile('vault', '_inbox/_web-ingest-state.json');
    expect(file.content).toContain('seen1.com');
    expect(file.content).toContain('seen2.com');
  });
});
