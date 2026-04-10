// Tests 4-step sequence and cron documentation. No Obsidian required.

import { describe, expect, test } from 'bun:test';
import { CRON_ENTRY, runMorning } from '../../../src/commands/morning';
import type { VaultOps } from '../../../src/ports/vault-ops';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockOps(overrides: Partial<VaultOps> = {}): VaultOps {
  return {
    fileExists: async () => false,
    readFile: async (_v, p) => ({ path: p, content: '', frontmatter: {} }),
    readFiles: async (_v, paths) => paths.map(p => ({ path: p, content: '', frontmatter: {} })),
    createFile: async () => undefined,
    updateFrontmatter: async () => undefined,
    listFiles: async () => [],
    appendToDaily: async () => undefined,
    openDaily: async () => undefined,
    listRecentFiles: async () => [],
    listUnresolved: async () => [],
    trashFile: async () => undefined,
    appendToFile: async () => undefined,
    replaceFileContent: async () => undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 4-step sequence
// ---------------------------------------------------------------------------

describe('runMorning', () => {
  test('calls openDaily, listFiles, appendToDaily, listRecentFiles, listUnresolved', async () => {
    const calls: string[] = [];
    const ops = makeMockOps({
      openDaily: async () => {
        calls.push('openDaily');
      },
      listFiles: async () => {
        calls.push('listFiles');
        return [];
      },
      appendToDaily: async () => {
        calls.push('appendToDaily');
      },
      listRecentFiles: async () => {
        calls.push('listRecentFiles');
        return [];
      },
      listUnresolved: async () => {
        calls.push('listUnresolved');
        return [];
      },
    });
    await runMorning('testvault', ops);
    expect(calls).toEqual([
      'openDaily',
      'listFiles',
      'appendToDaily',
      'listRecentFiles',
      'listUnresolved',
    ]);
  });

  test('inboxCount counts files under _inbox/', async () => {
    const ops = makeMockOps({
      listFiles: async (_vault, filter) => {
        const all = [
          { path: '_inbox/note1.md', frontmatter: {} },
          { path: '_inbox/note2.md', frontmatter: {} },
          { path: 'projects/foo.md', frontmatter: {} },
          { path: '_inbox/note3.md', frontmatter: {} },
        ];
        if (filter?.folder) {
          const prefix = filter.folder.endsWith('/') ? filter.folder : filter.folder + '/';
          return all.filter(e => e.path.startsWith(prefix));
        }
        return all;
      },
    });
    const result = await runMorning('vault', ops);
    expect(result.inboxCount).toBe(3);
  });

  test('recentFiles populated from listRecentFiles', async () => {
    const ops = makeMockOps({
      listRecentFiles: async () => ['file1.md', 'file2.md', 'file3.md'],
    });
    const result = await runMorning('vault', ops);
    expect(result.recentFiles).toEqual(['file1.md', 'file2.md', 'file3.md']);
  });

  test('unresolvedCount matches listUnresolved length', async () => {
    const ops = makeMockOps({
      listUnresolved: async () => ['[[broken1]]', '[[broken2]]'],
    });
    const result = await runMorning('vault', ops);
    expect(result.unresolvedCount).toBe(2);
  });

  test('unresolvedCount is 0 when listUnresolved returns empty', async () => {
    const ops = makeMockOps({
      listUnresolved: async () => [],
    });
    const result = await runMorning('vault', ops);
    expect(result.unresolvedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cron documentation
// ---------------------------------------------------------------------------

describe('CRON_ENTRY', () => {
  test('cron entry matches weekday 08:00 pattern', () => {
    expect(CRON_ENTRY).toContain('0 8 * * 1-5');
  });

  test('cron entry references nerv morning', () => {
    expect(CRON_ENTRY).toContain('nerv morning');
  });
});
