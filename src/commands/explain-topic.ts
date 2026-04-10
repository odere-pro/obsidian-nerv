/**
 * explain-topic — Sensory skill: assemble a teaching bundle for a queried topic.
 *
 * Composes context.scoreNote and get-entity.resolveEntity as direct module imports
 * (no subprocess calls). VaultOps fetches all vault data; TypeScript does
 * scoring, matching, sibling resolution, and connected-note assembly.
 *
 * Exports:
 *   - ExplainResult (output type)
 *   - explainTopic(vault, query, ops?) — programmatic API
 *   - default Command — CLI entry point
 *
 * Output schema:
 *   {
 *     "primary":   {<EntityOutput>},
 *     "parent":    {"title":"...","summary":"..."} | null,
 *     "siblings":  [{"title":"...","summary":"..."}],
 *     "connected": [{"title":"...","summary":"...","kind":"...","rel":"..."}]
 *   }
 */

import {
  buildBacklinks,
  extractOutgoingLinks,
  extractSummary,
  parseConnections,
  resolveWikiLink,
} from '../lib/explain-parsers';
import { parseSections } from '../lib/markdown';
import { getVaultOps } from '../ports/provider';
import type { VaultOps } from '../ports/vault-ops';
import { BaseCommand, type CommandContext } from './base-command';
import { scoreNote } from './context';
import type { EntityNote, EntityOutput } from './get-entity';
import { resolveEntity } from './get-entity';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
 * Vault data fetch via VaultOps
 * --------------------------------------------------------------------------- */

async function fetchAllNotes(vault: string, ops: VaultOps): Promise<EntityNote[]> {
  const entries = await ops.listFiles(vault);
  const notes: EntityNote[] = [];
  const files = await ops.readFiles(
    vault,
    entries.map(e => e.path)
  );

  for (let i = 0; i < entries.length; i++) {
    const file = files[i];
    const basename = entries[i].path.replace(/.*\//, '').replace(/\.md$/, '');
    const outgoing = extractOutgoingLinks(file.content);
    notes.push({
      path: entries[i].path,
      basename,
      frontmatter: file.frontmatter,
      rawBody: file.content,
      backlinks: [],
      outgoing,
    });
  }

  /* Second pass: build backlinks from outgoing links */
  for (const note of notes) {
    note.backlinks = buildBacklinks(notes, note.basename);
  }

  return notes;
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

export async function explainTopic(
  vault: string,
  query: string,
  ops?: VaultOps
): Promise<ExplainResult | null> {
  const vaultOps = ops ?? getVaultOps();
  const notes = await fetchAllNotes(vault, vaultOps).catch(() => [] as EntityNote[]);

  /* Step 1: Find highest-scoring note via scoreNote (same algorithm as context) */
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
    /* Fall back to resolveEntity for exact/alias/slug/title/fuzzy match */
    const match = resolveEntity(query, notes);
    if (!match) return null;
    bestNote = match.note;
  }

  /* Step 2: Build primary entity output */
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

  /* Step 3: Build basename → note map for sibling + connected lookups */
  const noteMap = new Map<string, EntityNote>();
  for (const n of notes) noteMap.set(n.basename, n);

  /* Step 4: Parent */
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

  /* Step 5: Siblings — notes sharing same parent (excluding primary) */
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

  /* Step 6: Connected — resolve typed connection targets from primary's ## Connections */
  const connections = parseConnections(bestNote.rawBody);
  const connected: ConnectedEntry[] = [];
  for (const conn of connections) {
    const target = conn.target;
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

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

class ExplainTopicCommand extends BaseCommand {
  readonly name = 'explain-topic';
  readonly description = 'Assemble a teaching bundle for a queried topic';
  readonly usage = 'nerv explain-topic [--vault <name>] "<query>"';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    const query = ctx.positional[0];
    const result = await explainTopic(ctx.vault, query);

    if (!result) {
      ctx.out.error(`explain-topic: no matching note found for query: ${query}`);
    }

    process.stdout.write(JSON.stringify(result) + '\n');
  }
}

export default new ExplainTopicCommand();
