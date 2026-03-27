// STORY-035 — Migrate sensory skills to TypeScript
// get-entity — Sensory skill: deep single-note retrieval with 5-level match resolution.
//
// Exports:
//   - EntityNote, BacklinkEntry, OutgoingEntry (types)
//   - MatchType, MatchResult (types)
//   - resolveEntity(query, notes) — pure match-resolution function, zero side effects
//   - getEntity(vault, query) — programmatic API used by explain-topic
//   - default Command — CLI entry point
//
// Match levels (tried in order; first level with exactly one result wins):
//   1. exact    — basename === query (case-insensitive)
//   2. alias    — any frontmatter alias exactly equals query (case-insensitive)
//   3. slug     — normalize(basename) === normalize(query)  [strips "PREFIX.slug - " prefix]
//   4. title    — frontmatter.title contains query as substring (case-insensitive)
//   5. fuzzy    — basename or normalized basename contains query as substring

import type { Command } from '../cli';
import { parseJson } from '../lib/json';
import { obEval, resolveVault } from '../lib/obsidian';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacklinkEntry {
  path: string;
  title: string;
  type: string;
  kind: string;
  spine: string;
}

export interface OutgoingEntry {
  path: string;
  title: string;
  display: string;
}

/** Full vault note data returned by the obEval batch fetch. */
export interface EntityNote {
  path: string;
  basename: string;
  frontmatter: Record<string, unknown>;
  rawBody: string;
  backlinks: BacklinkEntry[];
  outgoing: OutgoingEntry[];
}

export type MatchType = 'exact' | 'alias' | 'slug' | 'title' | 'fuzzy';

export interface MatchResult {
  note: EntityNote;
  matchType: MatchType;
}

// ---------------------------------------------------------------------------
// Pure match-resolution function
// ---------------------------------------------------------------------------

/** Strip note naming prefixes like "ML.gpt-4 - GPT-4" → "gpt-4". */
function normalizeBasename(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[a-z0-9_-]+\.[a-z0-9_-]+ - /i, '')
    .replace(/^[a-z0-9_-]+\./i, '')
    .trim();
}

function getAliases(fm: Record<string, unknown>): string[] {
  const v = fm['aliases'] ?? fm['alias'];
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map(a => String(a).toLowerCase());
}

/**
 * Resolve which note best matches the query using 5-level resolution.
 *
 * Pure function — no I/O, no Obsidian required. Pass the full list of vault notes
 * (returned by the obEval batch fetch) and the raw query string.
 *
 * Returns the matched note with its matchType, or null if no unambiguous match exists.
 */
export function resolveEntity(query: string, notes: EntityNote[]): MatchResult | null {
  const termLow = query.toLowerCase();
  const termNorm = normalizeBasename(query);

  // Level 1: exact basename match (case-insensitive)
  for (const note of notes) {
    if (note.basename.toLowerCase() === termLow) {
      return { note, matchType: 'exact' };
    }
  }

  // Level 2: alias exact match
  for (const note of notes) {
    if (getAliases(note.frontmatter).some(a => a === termLow)) {
      return { note, matchType: 'alias' };
    }
  }

  // Level 3: slug match — normalize(basename) === normalize(query)
  const slugMatches: EntityNote[] = [];
  for (const note of notes) {
    const norm = normalizeBasename(note.basename);
    if (norm === termNorm && norm !== note.basename.toLowerCase()) {
      // Only count as slug match when normalization actually changed something
      slugMatches.push(note);
    }
  }
  if (slugMatches.length === 1) return { note: slugMatches[0], matchType: 'slug' };

  // Level 4: title substring match
  const titleMatches: EntityNote[] = [];
  for (const note of notes) {
    const titleLow = String(note.frontmatter['title'] ?? note.basename).toLowerCase();
    if (titleLow.includes(termLow)) {
      titleMatches.push(note);
    }
  }
  if (titleMatches.length === 1) return { note: titleMatches[0], matchType: 'title' };

  // Level 5: fuzzy — basename contains query as substring
  const seen = new Set<string>();
  const fuzzyMatches: EntityNote[] = [];
  for (const note of notes) {
    const baseLow = note.basename.toLowerCase();
    const baseNorm = normalizeBasename(note.basename);
    const aliasHit = getAliases(note.frontmatter).some(a => a.includes(termLow));
    if (
      (baseLow.includes(termLow) || baseNorm.includes(termNorm) || aliasHit) &&
      !seen.has(note.path)
    ) {
      seen.add(note.path);
      fuzzyMatches.push(note);
    }
  }
  if (fuzzyMatches.length === 1) return { note: fuzzyMatches[0], matchType: 'fuzzy' };

  return null;
}

// ---------------------------------------------------------------------------
// Section parser
// ---------------------------------------------------------------------------

function parseSections(rawBody: string): Record<string, string> {
  const body = rawBody.replace(/^---[\s\S]*?---\n?/, '');
  const parts = body.split(/\n(?=## )/);
  const sections: Record<string, string> = {};
  for (const part of parts) {
    const m = part.match(/^## (.+)\n?([\s\S]*)/);
    if (m) {
      sections[m[1].trim()] = (m[2] ?? '').trim().substring(0, 3000);
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Obsidian data fetch
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

export interface EntityOutput {
  path: string;
  matchType: MatchType;
  frontmatter: Record<string, unknown>;
  sections: Record<string, string>;
  backlinks: BacklinkEntry[];
  outgoing: OutgoingEntry[];
}

/** Fetch and resolve a single entity by query. Returns null when not found. */
export async function getEntity(vault: string, query: string): Promise<EntityOutput | null> {
  const raw = await obEval(vault, buildFetchExpr()).catch(() => '[]');
  const notes = parseJson<EntityNote[]>(raw) ?? [];

  const match = resolveEntity(query, notes);
  if (!match) return null;

  const { note, matchType } = match;
  return {
    path: note.path,
    matchType,
    frontmatter: note.frontmatter,
    sections: parseSections(note.rawBody),
    backlinks: note.backlinks,
    outgoing: note.outgoing,
  };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'get-entity',
  description: 'Deep single-note retrieval with 5-level match resolution',

  async run(args: string[]): Promise<void> {
    if (args.length < 2) {
      process.stderr.write('Usage: nerv get-entity <vault|vault=name> "<search-term>"\n');
      process.exit(1);
    }

    const vault = await resolveVault(args[0]);
    const query = args[1];
    const result = await getEntity(vault, query);

    if (!result) {
      process.stdout.write(JSON.stringify({ found: false, query }) + '\n');
      return;
    }

    process.stdout.write(JSON.stringify(result) + '\n');
  },
};

export default command;
