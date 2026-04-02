// Uses MockVaultOps for stateful vault assertions — no Obsidian instance required.

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as provider from '../../../src/ports/provider';
import { MockVaultOps } from '../../../src/ports/mock-vault-ops';
import { addConnection } from '../../../src/commands/add-connection';

// Standard ontology content with rel-type table
const ontologyContent = [
  '| rel_type | description | inverse | symmetric |',
  '| --- | --- | --- | --- |',
  '| `depends-on` | A depends on B | `depended-by` | |',
  '| `compares-to` | A compares to B | `compares-to` | yes |',
].join('\n');

// Source/target file content with ## Connections section
function noteContent(existingConnections: string[] = []): string {
  const connLines = existingConnections.map(c => `- ${c}`).join('\n');
  return `---\ntitle: Test\n---\n\n## Body\n\nSome content.\n\n## Connections\n${connLines ? connLines + '\n' : ''}\n## Notes\n`;
}

describe('addConnection', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
  });

  afterEach(() => {
    mock.restore();
  });

  /** Seed source, target, and ontology files into the in-memory vault. */
  function seedStandard(
    opts: {
      sourceContent?: string;
      targetContent?: string;
      ontology?: string;
    } = {}
  ): void {
    mockOps.seedFile('v', 'projects/p/_ontology.p.md', opts.ontology ?? ontologyContent, {});
    mockOps.seedFile('v', 'projects/p/PROJ.a - A.md', opts.sourceContent ?? noteContent(), {});
    mockOps.seedFile('v', 'projects/p/PROJ.b - B.md', opts.targetContent ?? noteContent(), {});
  }

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------
  test('returns forwardWritten:skipped when connection already exists', async () => {
    seedStandard({
      sourceContent: noteContent(['depends-on :: [[PROJ.b - B|B]]']),
    });
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.forwardWritten).toBe('skipped');
  });

  // ---------------------------------------------------------------------------
  // Inverse wiring
  // ---------------------------------------------------------------------------
  test('writes inverse connection using ontology lookup', async () => {
    seedStandard({});
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.forwardWritten).toBe(true);
    expect(result.data.inverseWritten).toBe(true);
    // Verify vault state: source has forward connection, target has inverse
    const source = await mockOps.readFile('v', 'projects/p/PROJ.a - A.md');
    expect(source.content).toContain('depends-on :: [[PROJ.b - B|B]]');
    const target = await mockOps.readFile('v', 'projects/p/PROJ.b - B.md');
    expect(target.content).toContain('depended-by :: [[PROJ.a - A|A]]');
  });

  test('handles symmetric relationship (inverseType equals relType)', async () => {
    seedStandard({});
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'compares-to',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7-connection limit
  // ---------------------------------------------------------------------------
  test('returns error when connection limit is reached on source', async () => {
    const sevenConns = Array.from(
      { length: 7 },
      (_, i) => `depends-on :: [[PROJ.x${i} - X${i}|X${i}]]`
    );
    seedStandard({ sourceContent: noteContent(sevenConns) });
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Connection limit (7)');
  });

  test('reports inverseError when limit reached on target', async () => {
    const sevenConns = Array.from(
      { length: 7 },
      (_, i) => `depended-by :: [[PROJ.x${i} - X${i}|X${i}]]`
    );
    seedStandard({ targetContent: noteContent(sevenConns) });
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'projects/p/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(true);
    expect(result.data.forwardWritten).toBe(true);
    expect(result.data.inverseError).toContain('Connection limit (7)');
  });

  // ---------------------------------------------------------------------------
  // Project slug derivation
  // ---------------------------------------------------------------------------
  test('returns error when source path is not under projects/', async () => {
    const result = await addConnection({
      vault: 'v',
      sourcePath: 'notes/PROJ.a - A.md',
      relType: 'depends-on',
      targetPath: 'projects/p/PROJ.b - B.md',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cannot derive project slug');
  });
});
