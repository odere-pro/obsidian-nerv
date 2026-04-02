// Uses MockVaultOps for stateful vault assertions — no Obsidian instance required.

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as obsidianLib from '../../../src/lib/obsidian';
import * as provider from '../../../src/ports/provider';
import { MockVaultOps } from '../../../src/ports/mock-vault-ops';
import { importJson } from '../../../src/commands/import-json';

describe('importJson', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
    spyOn(obsidianLib, 'rollbackLog').mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  /** Seed the ROOT parent note that createEntity expects to find. */
  function seedParent(): void {
    mockOps.seedFile('v', 'projects/proj/PROJ.ROOT - Project.md', '', {
      spine: 'proj',
      children: [],
    });
  }

  // ---------------------------------------------------------------------------
  // Skip / create counting
  // ---------------------------------------------------------------------------
  test('counts created notes correctly', async () => {
    seedParent();
    const { created, skipped } = await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        { name: 'NoteA', type: 'LEAF', kind: 'concept' },
        { name: 'NoteB', type: 'LEAF', kind: 'concept' },
      ],
    });
    expect(created).toBe(2);
    expect(skipped).toBe(0);
    // Verify vault state
    expect(await mockOps.fileExists('v', 'projects/proj/PROJ.notea - NoteA.md')).toBe(true);
    expect(await mockOps.fileExists('v', 'projects/proj/PROJ.noteb - NoteB.md')).toBe(true);
  });

  test('skips notes that already exist (idempotency)', async () => {
    seedParent();
    // Seed the target file so fileExists returns true
    mockOps.seedFile('v', 'projects/proj/PROJ.existingnote - ExistingNote.md', '', {});
    const { created, skipped } = await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [{ name: 'ExistingNote', type: 'LEAF', kind: 'concept' }],
    });
    expect(created).toBe(0);
    expect(skipped).toBe(1);
  });

  test('skips entries with missing name and increments skipped count', async () => {
    seedParent();
    const { created, skipped } = await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        { name: '' } as { name: string },
        { name: 'ValidNote', type: 'LEAF', kind: 'concept' },
      ],
    });
    expect(skipped).toBe(1);
    expect(created).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Extra field passthrough
  // ---------------------------------------------------------------------------
  test('applies extra non-standard fields to frontmatter', async () => {
    seedParent();
    await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        {
          name: 'NoteWithExtra',
          type: 'LEAF',
          kind: 'concept',
          priority: 'high',
          team: 'platform',
        },
      ],
    });
    const file = await mockOps.readFile('v', 'projects/proj/PROJ.notewithextra - NoteWithExtra.md');
    expect(file.frontmatter.priority).toBe('high');
    expect(file.frontmatter.team).toBe('platform');
  });

  test('does not add extra frontmatter when there are no extra fields', async () => {
    seedParent();
    await importJson({
      vault: 'v',
      projectSlug: 'proj',
      entries: [
        { name: 'PlainNote', type: 'LEAF', kind: 'concept', spine: 'proj', parent: 'ROOT' },
      ],
    });
    const file = await mockOps.readFile('v', 'projects/proj/PROJ.plainnote - PlainNote.md');
    expect(file.frontmatter.priority).toBeUndefined();
    expect(file.frontmatter.team).toBeUndefined();
  });
});
