// Uses MockVaultOps for stateful vault assertions — no Obsidian instance required.

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as obsidianLib from '../../../src/lib/obsidian';
import * as provider from '../../../src/ports/provider';
import { MockVaultOps } from '../../../src/ports/mock-vault-ops';
import { createProject } from '../../../src/commands/create-project';

describe('create-project', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
    spyOn(obsidianLib, 'rollbackLog').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  // ---------------------------------------------------------------------------
  // Slug validation
  // ---------------------------------------------------------------------------
  describe('slug validation', () => {
    test('accepts a valid lowercase-alphanumeric slug', async () => {
      await createProject({ vault: 'v', slug: 'my-project', title: 'My Project' });
      expect(
        await mockOps.fileExists('v', 'projects/my-project/MY-PROJECT.ROOT - My Project.md')
      ).toBe(true);
    });

    test('accepts a slug with numbers', async () => {
      await createProject({ vault: 'v', slug: 'proj123', title: 'Proj' });
      expect(await mockOps.fileExists('v', 'projects/proj123/PROJ123.ROOT - Proj.md')).toBe(true);
    });

    test('rejects a slug with uppercase letters', async () => {
      expect(createProject({ vault: 'v', slug: 'BadSlug', title: 'T' })).rejects.toThrow();
    });

    test('rejects a slug with path traversal characters', async () => {
      expect(createProject({ vault: 'v', slug: '../etc', title: 'T' })).rejects.toThrow();
    });

    test('rejects an empty slug', async () => {
      expect(createProject({ vault: 'v', slug: '', title: 'T' })).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------
  describe('idempotency', () => {
    test('exits 0 without modification when ROOT already exists', async () => {
      // Seed the ROOT file so it already exists
      mockOps.seedFile('v', 'projects/my-proj/MY-PROJ.ROOT - T.md', '', {});
      const out: string[] = [];
      const orig = process.stdout.write.bind(process.stdout);
      process.stdout.write = (s: string): boolean => {
        out.push(s);
        return true;
      };
      try {
        await createProject({ vault: 'v', slug: 'my-proj', title: 'T' });
      } finally {
        process.stdout.write = orig;
      }
      // Only the seeded ROOT should exist — no additional files created
      const files = await mockOps.listFiles('v');
      expect(files.length).toBe(1);
      expect(out.join('')).toContain('already exists');
    });
  });

  // ---------------------------------------------------------------------------
  // File path generation
  // ---------------------------------------------------------------------------
  describe('file path generation', () => {
    test('creates ROOT note at projects/<slug>/<SLUG>.ROOT - <Title>.md', async () => {
      await createProject({ vault: 'v', slug: 'testslug', title: 'Test Title' });
      expect(await mockOps.fileExists('v', 'projects/testslug/TESTSLUG.ROOT - Test Title.md')).toBe(
        true
      );
    });

    test('creates _ontology, _vocab, _topk and .base files', async () => {
      await createProject({ vault: 'v', slug: 'proj', title: 'Proj Title' });
      expect(await mockOps.fileExists('v', 'projects/proj/_ontology.proj.md')).toBe(true);
      expect(await mockOps.fileExists('v', 'projects/proj/_vocab.proj.md')).toBe(true);
      expect(await mockOps.fileExists('v', 'projects/proj/_topk.proj.md')).toBe(true);
      expect(await mockOps.fileExists('v', 'projects/proj/proj.base')).toBe(true);
    });

    test('derives SLUG_UPPER correctly for multi-segment slug', async () => {
      await createProject({ vault: 'v', slug: 'my-proj', title: 'T' });
      expect(await mockOps.fileExists('v', 'projects/my-proj/MY-PROJ.ROOT - T.md')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // --vault flag form
  // ---------------------------------------------------------------------------
  test('accepts --vault flag form (resolved by resolveVault)', async () => {
    await createProject({ vault: 'study', slug: 'p', title: 'T' });
    expect(await mockOps.fileExists('study', 'projects/p/P.ROOT - T.md')).toBe(true);
  });
});
