// explain-topic — Sensory skill: assemble a teaching bundle for a queried topic.
//
// Composes context.scoreNote and get-entity.resolveEntity as direct module imports
// (no subprocess calls). A single obEval fetches all vault data; TypeScript does
// scoring, matching, sibling resolution, and connected-note assembly.
//
// Exports:
//   - ExplainResult (output type)
//   - explainTopic(vault, query) — programmatic API
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
import { parseJson } from '../lib/json';
import { obEval, resolveVault } from '../lib/obsidian';
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
// Obsidian data fetch (shared with get-entity)
// ---------------------------------------------------------------------------

function buildFetchExpr(): string {
  return `(async () => {
  var allFiles = app.vault.getMarkdownFiles();
  var notes = [];
  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var rawBody = await app.vault.cachedRead(f);
    var fmOut = {};
    var keys = Object.keys(fm);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] !== 'position') fmOut[keys[k]] = fm[keys[k]];
    }
    var backlinks = [];
    var blResult = app.metadataCache.getBacklinksForFile(f);
    if (blResult && blResult.data) {
      var blPaths = Object.keys(blResult.data);
      for (var b = 0; b < blPaths.length; b++) {
        var blPath = blPaths[b];
        var blFile = app.vault.getAbstractFileByPath(blPath);
        var blTitle = blPath, blType = '', blKind = '', blSpine = '';
        if (blFile) {
          var blCache = app.metadataCache.getFileCache(blFile);
          var blFm = (blCache && blCache.frontmatter) ? blCache.frontmatter : {};
          blTitle = String(blFm.title || blFile.basename);
          blType  = String(blFm.type  || '');
          blKind  = String(blFm.kind  || '');
          blSpine = String(blFm.spine || '');
        }
        backlinks.push({ path: blPath, title: blTitle, type: blType, kind: blKind, spine: blSpine });
      }
    }
    var outgoing = [];
    var linkItems = (cache && cache.links) ? cache.links : [];
    for (var l = 0; l < linkItems.length; l++) {
      var li = linkItems[l];
      var linkText = li.link || '';
      var display  = li.displayText || linkText;
      var destFile = app.metadataCache.getFirstLinkpathDest(linkText, f.path);
      var destPath = destFile ? destFile.path : '';
      var destTitle = linkText;
      if (destFile) {
        var dc = app.metadataCache.getFileCache(destFile);
        var dfm = (dc && dc.frontmatter) ? dc.frontmatter : {};
        destTitle = String(dfm.title || destFile.basename);
      }
      outgoing.push({ path: destPath, title: destTitle, display: display });
    }
    notes.push({
      path: f.path, basename: f.basename, frontmatter: fmOut, rawBody: rawBody,
      backlinks: backlinks, outgoing: outgoing
    });
  }
  return JSON.stringify(notes);
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

export async function explainTopic(vault: string, query: string): Promise<ExplainResult | null> {
  const raw = await obEval(vault, buildFetchExpr()).catch(() => '[]');
  const notes = parseJson<EntityNote[]>(raw) ?? [];

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
