// explain-topic — Sensory skill: assemble a teaching bundle for a queried topic.
//
// Composes context.scoreNote and get-entity.resolveEntity as direct module imports
// (no subprocess calls). VaultOps fetches all vault data; TypeScript does
// scoring, matching, sibling resolution, and connected-note assembly.
//
// Exports:
//   - ExplainResult (output type)
//   - explainTopic(vault, query, ops?) — programmatic API
//   - default Command — CLI entry point
//
// Output schema:
//   {
//     "primary":   {<EntityOutput>},
//     "parent":    {"title":"...","summary":"..."} | null,
//     "siblings":  [{"title":"...","summary":"..."}],
//     "connected": [{"title":"...","summary":"...","kind":"...","rel":"..."}]
//   }

import type { Command } from '../cli';
import { resolveVault } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import type { VaultOps } from '../ports/vault-ops';
import { scoreNote } from './context';
import type { EntityNote, EntityOutput } from './get-entity';
import { resolveEntity } from './get-entity';
import { extractVaultFlag } from '../lib/vault-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParentSummary {
  title: string;
  summary: string;
}

export interface SiblingSummary {
  title: string;
  summary: string;
}

export interface ConnectedEntry {
  title: string;
  summary: string;
  kind: string;
  rel: string;
}

export interface ExplainResult {
  primary: EntityOutput;
  parent: ParentSummary | null;
  siblings: SiblingSummary[];
  connected: ConnectedEntry[];
}

// ---------------------------------------------------------------------------
// Section parser helpers
// ---------------------------------------------------------------------------

function extractSummary(rawBody: string): string {
  const body = rawBody.replace(/^---[\s\S]*?---\n?/, '');
  const parts = body.split(/\n(?=## )/);
  for (const part of parts) {
    const m = part.match(/^## Summary\s*\n([\s\S]*)/);
    if (m) return (m[1] ?? '').trim().substring(0, 500);
  }
  return '';
}

function parseSections(rawBody: string): Record<string, string> {
  const body = rawBody.replace(/^---[\s\S]*?---\n?/, '');
  const parts = body.split(/\n(?=## )/);
  const sections: Record<string, string> = {};
  for (const part of parts) {
    const m = part.match(/^## (.+)\n?([\s\S]*)/);
    if (m) sections[m[1].trim()] = (m[2] ?? '').trim().substring(0, 3000);
  }
  return sections;
}

function parseConnections(
  rawBody: string
): Array<{ rel: string; target: string; context: string }> {
  const body = rawBody.replace(/^---[\s\S]*?---\n?/, '');
  const parts = body.split(/\n(?=## )/);
  let connSection = '';
  for (const part of parts) {
    if (/^## Connections\b/.test(part)) {
      connSection = part.replace(/^## Connections\n?/, '');
      break;
    }
  }
  const re = /^- ([a-z][\w-]*) :: \[\[([^\]]+)\]\](.*)?$/;
  const result: Array<{ rel: string; target: string; context: string }> = [];
  for (const line of connSection.split('\n')) {
    const m = line.trim().match(re);
    if (m) result.push({ rel: m[1], target: m[2], context: (m[3] ?? '').trim() });
  }
  return result;
}

function resolveWikiLink(raw: string): string {
  const m = String(raw ?? '').match(/\[\[([^\]#|]+)/);
  return m ? m[1].trim() : String(raw ?? '').trim();
}

// ---------------------------------------------------------------------------
// Wikilink extraction helpers — derive backlinks/outgoing from content
// ---------------------------------------------------------------------------

function extractOutgoingLinks(
  rawBody: string
): Array<{ path: string; title: string; display: string }> {
  const re = /\[\[([^\]#|]+)(?:\|([^\]]*))?\]\]/g;
  const links: Array<{ path: string; title: string; display: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawBody)) !== null) {
    const target = m[1].trim();
    const display = m[2]?.trim() ?? target;
    links.push({ path: '', title: target, display });
  }
  return links;
}

function buildBacklinks(
  notes: EntityNote[],
  targetBasename: string
): Array<{ path: string; title: string; type: string; kind: string; spine: string }> {
  const backlinks: Array<{
    path: string;
    title: string;
    type: string;
    kind: string;
    spine: string;
  }> = [];
  for (const n of notes) {
    if (n.basename === targetBasename) continue;
    for (const link of n.outgoing) {
      if (link.title === targetBasename || link.display === targetBasename) {
        backlinks.push({
          path: n.path,
          title: String(n.frontmatter['title'] ?? n.basename),
          type: String(n.frontmatter['type'] ?? ''),
          kind: String(n.frontmatter['kind'] ?? ''),
          spine: String(n.frontmatter['spine'] ?? ''),
        });
        break;
      }
    }
  }
  return backlinks;
}

// ---------------------------------------------------------------------------
// Vault data fetch via VaultOps
// ---------------------------------------------------------------------------

async function fetchAllNotes(vault: string, ops: VaultOps): Promise<EntityNote[]> {
  const entries = await ops.listFiles(vault);
  const notes: EntityNote[] = [];

  for (const entry of entries) {
    const file = await ops.readFile(vault, entry.path);
    const basename = entry.path.replace(/.*\//, '').replace(/\.md$/, '');
    const outgoing = extractOutgoingLinks(file.content);
    notes.push({
      path: entry.path,
      basename,
      frontmatter: file.frontmatter,
      rawBody: file.content,
      backlinks: [], // populated in a second pass
      outgoing,
    });
  }

  // Second pass: build backlinks from outgoing links
  for (const note of notes) {
    note.backlinks = buildBacklinks(notes, note.basename);
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

export async function explainTopic(
  vault: string,
  query: string,
  ops?: VaultOps
): Promise<ExplainResult | null> {
  const vaultOps = ops ?? getVaultOps();
  const notes = await fetchAllNotes(vault, vaultOps).catch(() => [] as EntityNote[]);

  // Step 1: Find highest-scoring note via scoreNote (same algorithm as context)
  let bestNote: EntityNote | null = null;
  let bestScore = 0;
  for (const note of notes) {
    const s = scoreNote(query, {
      basename: note.basename,
      frontmatter: note.frontmatter,
      rawBody: note.rawBody,
    });
    if (s > bestScore) {
      bestScore = s;
      bestNote = note;
    }
  }

  if (!bestNote || bestScore === 0) {
    // Fall back to resolveEntity for exact/alias/slug/title/fuzzy match
    const match = resolveEntity(query, notes);
    if (!match) return null;
    bestNote = match.note;
  }

  // Step 2: Build primary entity output
  const primary: EntityOutput = {
    path: bestNote.path,
    matchType: 'exact',
    frontmatter: bestNote.frontmatter,
    sections: parseSections(bestNote.rawBody),
    backlinks: bestNote.backlinks,
    outgoing: bestNote.outgoing,
  };

  const fm = bestNote.frontmatter;
  const parentVal = String(fm['parent'] ?? '');
  const parentName = resolveWikiLink(parentVal);
  const isRoot = String(fm['type'] ?? '') === 'ROOT';

  // Step 3: Build basename → note map for sibling + connected lookups
  const noteMap = new Map<string, EntityNote>();
  for (const n of notes) noteMap.set(n.basename, n);

  // Step 4: Parent
  let parent: ParentSummary | null = null;
  if (!isRoot && parentName) {
    const parentNote = noteMap.get(parentName);
    if (parentNote) {
      parent = {
        title: String(parentNote.frontmatter['title'] ?? parentNote.basename),
        summary: extractSummary(parentNote.rawBody),
      };
    }
  }

  // Step 5: Siblings — notes sharing same parent (excluding primary)
  const siblings: SiblingSummary[] = [];
  if (parentName) {
    for (const n of notes) {
      if (n.path === bestNote.path) continue;
      const nParentName = resolveWikiLink(String(n.frontmatter['parent'] ?? ''));
      if (nParentName === parentName) {
        siblings.push({
          title: String(n.frontmatter['title'] ?? n.basename),
          summary: extractSummary(n.rawBody),
        });
      }
    }
  }

  // Step 6: Connected — resolve typed connection targets from primary's ## Connections
  const connections = parseConnections(bestNote.rawBody);
  const connected: ConnectedEntry[] = [];
  for (const conn of connections) {
    const target = conn.target;
    // Try to find by basename or path match
    let destNote: EntityNote | undefined;
    for (const n of notes) {
      if (n.basename === target || n.path === target) {
        destNote = n;
        break;
      }
    }
    if (!destNote) continue;
    connected.push({
      title: String(destNote.frontmatter['title'] ?? destNote.basename),
      summary: extractSummary(destNote.rawBody),
      kind: String(destNote.frontmatter['kind'] ?? ''),
      rel: conn.rel,
    });
  }

  return { primary, parent, siblings, connected };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'explain-topic',
  description: 'Assemble a teaching bundle for a queried topic',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 1) {
      process.stderr.write('Usage: nerv explain-topic [--vault <name>] "<query>"\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const query = rest[0];
    const result = await explainTopic(vault, query);

    if (!result) {
      process.stderr.write(`ERROR: explain-topic: no matching note found for query: ${query}\n`);
      process.exit(1);
    }

    process.stdout.write(JSON.stringify(result) + '\n');
  },
};

export default command;
