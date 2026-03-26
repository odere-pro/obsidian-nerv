// STORY-040 — Unit tests for web-ingest/batch command
// Mocks ingestUrl so no network or Obsidian required.

import { describe, expect, test, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIngestUrl = mock(async (_url: string, _vault: string, _project: string) => ({
  ok: true as const,
  data: {
    ingested: true,
    path: 'projects/proj/PROJ.x.md',
    title: 'T',
    url: _url,
    wordCount: 10,
    tokenEstimate: 13,
  },
}));

mock.module('../../web-ingest/add.ts', () => ({
  ingestUrl: mockIngestUrl,
}));

const { runBatch } = await import('../../web-ingest/batch.ts');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runBatch', () => {
  beforeEach(() => {
    mockIngestUrl.mockReset();
  });

  test('ingests all URLs in order', async () => {
    mockIngestUrl.mockImplementation(async url => ({
      ok: true as const,
      data: {
        ingested: true,
        path: `proj/${url}`,
        title: 'T',
        url,
        wordCount: 5,
        tokenEstimate: 7,
      },
    }));

    const summary = await runBatch('vault', 'proj', {
      urls: ['https://a.com', 'https://b.com', 'https://c.com'],
    });

    expect(summary.ingested).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
  });

  test('counts skipped when URL already ingested (ingested:false)', async () => {
    mockIngestUrl.mockImplementation(async url => ({
      ok: true as const,
      data: {
        ingested: false,
        path: `proj/${url}`,
        title: '',
        url,
        wordCount: 0,
        tokenEstimate: 0,
      },
    }));

    const summary = await runBatch('vault', 'proj', {
      urls: ['https://seen.com'],
    });

    expect(summary.skipped).toBe(1);
    expect(summary.ingested).toBe(0);
  });

  test('counts failed and continues when ingestUrl rejects', async () => {
    mockIngestUrl
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ingested: true,
          path: 'ok',
          title: 'T',
          url: 'https://good.com',
          wordCount: 3,
          tokenEstimate: 4,
        },
      })
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ingested: true,
          path: 'ok2',
          title: 'T2',
          url: 'https://good2.com',
          wordCount: 2,
          tokenEstimate: 3,
        },
      });

    const summary = await runBatch('vault', 'proj', {
      urls: ['https://good.com', 'https://bad.com', 'https://good2.com'],
    });

    expect(summary.ingested).toBe(2);
    expect(summary.failed).toBe(1);
  });

  test('accumulates totalTokens from all ingested articles', async () => {
    mockIngestUrl.mockImplementation(async url => ({
      ok: true as const,
      data: { ingested: true, path: url, title: 'T', url, wordCount: 10, tokenEstimate: 13 },
    }));

    const summary = await runBatch('vault', 'proj', {
      urls: ['https://a.com', 'https://b.com'],
    });

    expect(summary.totalTokens).toBe(26);
  });

  test('passes parent slug to ingestUrl when specified', async () => {
    mockIngestUrl.mockResolvedValue({
      ok: true,
      data: { ingested: true, path: 'p', title: 'T', url: 'u', wordCount: 1, tokenEstimate: 2 },
    });

    await runBatch('vault', 'proj', {
      urls: ['https://example.com'],
      parent: 'my-parent',
    });

    const calls = mockIngestUrl.mock.calls;
    expect(calls[0][3]).toBe('my-parent');
  });
});
