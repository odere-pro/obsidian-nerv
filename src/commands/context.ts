// STORY-035 — Migrate sensory skills to TypeScript
// context — Primary sensory skill: relevance-scored vault retrieval.
//
// Exports:
//   - ScoringNote (input type for scoreNote)
//   - ContextResult, ContextOutput (output types)
//   - scoreNote(query, note) — pure scoring function, zero side effects
//   - contextSearch(vault, query, limit) — programmatic API used by explain-topic
//   - default Command — CLI entry point
//
// Scoring weights (per term):
//   title match        +10
//   alias match        +8  (first matching alias only)
//   kind match         +5
//   spine match        +4
//   tag match          +3  (first matching tag only)
//   body term freq     +1 per occurrence, capped at +5

import type { Command } from '../cli';
import { parseJson } from '../lib/json';
import { obEval, resolveVault } from '../lib/obsidian';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal note data required by the pure scoreNote function. */
export interface ScoringNote {
  basename: string;
  frontmatter: Record<string, unknown>;
  /** Full file content including YAML frontmatter block (used for body TF scoring). */
  rawBody: string;
}

export interface ConnectionEntry {
  rel: string;
  target: string;
  context: string;
}

export interface ContextResult {
  path: string;
  title: string;
  type: string;
  kind: string;
  spine: string;
  status: string;
  parent: string;
  children: string[];
  aliases: string[];
  breadcrumb: string;
  summary: string;
  content: string;
  connections: ConnectionEntry[];
}

export interface ContextOutput {
  query: string;
  vault: string;
  results: ContextResult[];
}

// ---------------------------------------------------------------------------
// Pure scoring function
// ---------------------------------------------------------------------------

function normalizeTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

function fmLow(fm: Record<string, unknown>, key: string): string {
  const v = fm[key];
  return v !== undefined && v !== null ? String(v).toLowerCase() : '';
}

function fmStringArray(fm: Record<string, unknown>, key: string, altKey: string): string[] {
  const v = fm[key] ?? fm[altKey];
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map(a => String(a).toLowerCase());
}

/**
 * Score a single note against a query string.
 *
 * Pure function — no I/O, no side effects. Safe to call in unit tests without Obsidian.
 *
 * Scoring weights (per query term):
 *   title match        +10
 *   alias match        +8  (first matching alias only)
 *   kind match         +5
 *   spine match        +4
 *   tag match          +3  (first matching tag only)
 *   body term freq     +1 per occurrence, capped at +5
 */
export function scoreNote(query: string, note: ScoringNote): number {
  const terms = normalizeTerms(query);
  if (terms.length === 0) return 0;

  const fm = note.frontmatter;
  const title = fmLow(fm, 'title') || note.basename.toLowerCase();
  const kind = fmLow(fm, 'kind');
  const spine = fmLow(fm, 'spine');
  const aliases = fmStringArray(fm, 'aliases', 'alias');
  const tags = fmStringArray(fm, 'tags', 'tag');
  const bodyLow = note.rawBody.toLowerCase();

  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 10;
    if (aliases.some(a => a.includes(term))) score += 8;
    if (kind.includes(term)) score += 5;
    if (spine.includes(term)) score += 4;
    if (tags.some(t => t.includes(term))) score += 3;

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const freq = (bodyLow.match(new RegExp(escaped, 'g')) ?? []).length;
    score += Math.min(freq, 5);
  }

  return score;
}

// ---------------------------------------------------------------------------
// Section parsing helpers (used in result assembly)
// ---------------------------------------------------------------------------

function extractSection(body: string, heading: string): string {
  const parts = body.split(/\n(?=## )/);
  for (const part of parts) {
    const m = part.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*)`));
    if (m) return (m[1] ?? '').trim();
  }
  return '';
}

function parseConnectionSection(body: string): ConnectionEntry[] {
  const section = extractSection(body, 'Connections');
  const re = /^- ([a-z][\w-]*) :: \[\[([^\]]+)\]\](.*)?$/;
  const result: ConnectionEntry[] = [];
  for (const line of section.split('\n')) {
    const m = line.trim().match(re);
    if (m) result.push({ rel: m[1], target: m[2], context: (m[3] ?? '').trim() });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Breadcrumb builder — pure, operates on the fetched note map
// ---------------------------------------------------------------------------

function buildBreadcrumb(
  basename: string,
  fm: Record<string, unknown>,
  noteMap: Map<string, { basename: string; frontmatter: Record<string, unknown> }>
): string {
  const crumbs: string[] = [basename];
  const seen = new Set<string>([basename]);
  let cur = fm;
  let cycled = false;

  for (let hop = 0; hop < 5; hop++) {
    const parentVal = String(cur['parent'] ?? '');
    if (!parentVal) break;

    const pm = parentVal.match(/\[\[([^\]#|]+)/);
    const parentName = pm ? pm[1].trim() : parentVal.trim();
    if (!parentName) break;

    if (seen.has(parentName)) {
      cycled = true;
      break;
    }
    seen.add(parentName);

    const parentNote = noteMap.get(parentName);
    if (!parentNote) {
      crumbs.unshift(parentName);
      break;
    }
    crumbs.unshift(parentNote.basename);
    cur = parentNote.frontmatter;
    if (String(cur['type'] ?? '') === 'ROOT') break;
  }

  if (cycled) crumbs.push('[cycle detected]');
  return crumbs.join(' > ');
}

// ---------------------------------------------------------------------------
// Obsidian data fetch
// ---------------------------------------------------------------------------

interface RawVaultNote {
  path: string;
  basename: string;
  frontmatter: Record<string, unknown>;
  rawBody: string;
}

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
    notes.push({ path: f.path, basename: f.basename, frontmatter: fmOut, rawBody: rawBody });
  }
  return JSON.stringify(notes);
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/** Search vault for notes matching query, ranked by relevance score. */
export async function contextSearch(
  vault: string,
  query: string,
  limit = 5
): Promise<ContextOutput> {
  const raw = await obEval(vault, buildFetchExpr()).catch(() => '[]');
  const rawNotes = parseJson<RawVaultNote[]>(raw) ?? [];

  const noteMap = new Map<string, { basename: string; frontmatter: Record<string, unknown> }>();
  for (const n of rawNotes) {
    noteMap.set(n.basename, { basename: n.basename, frontmatter: n.frontmatter });
  }

  const scored: Array<{ note: RawVaultNote; score: number }> = [];
  for (const note of rawNotes) {
    const s = scoreNote(query, note);
    if (s > 0) scored.push({ note, score: s });
  }

  scored.sort((a, b) => b.score - a.score);
  const topN = scored.slice(0, limit);

  const results: ContextResult[] = topN.map(({ note }) => {
    const fm = note.frontmatter;
    const body = note.rawBody.replace(/^---[\s\S]*?---\n?/, '');
    const aliasesRaw = fm['aliases'] ?? fm['alias'];
    const aliases = (Array.isArray(aliasesRaw) ? aliasesRaw : aliasesRaw ? [aliasesRaw] : []).map(
      String
    );

    return {
      path: note.path,
      title: String(fm['title'] ?? note.basename),
      type: String(fm['type'] ?? ''),
      kind: String(fm['kind'] ?? ''),
      spine: String(fm['spine'] ?? ''),
      status: String(fm['status'] ?? ''),
      parent: String(fm['parent'] ?? ''),
      children: (Array.isArray(fm['children']) ? fm['children'] : []).map(String),
      aliases,
      breadcrumb: buildBreadcrumb(note.basename, fm, noteMap),
      summary: extractSection(body, 'Summary'),
      content: extractSection(body, 'Content').substring(0, 2000),
      connections: parseConnectionSection(body),
    };
  });

  return { query, vault, results };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'context',
  description: 'Relevance-scored vault retrieval for a query',

  async run(args: string[]): Promise<void> {
    if (args.length < 2) {
      process.stderr.write('Usage: nerv context <vault|vault=name> "<query>" [<limit>]\n');
      process.exit(1);
    }

    const vault = await resolveVault(args[0]);
    const query = args[1];
    const limitStr = args[2] ?? '5';
    const limit = parseInt(limitStr, 10);

    if (isNaN(limit) || limit < 1) {
      process.stderr.write(`ERROR: context: limit must be a positive integer (got: ${limitStr})\n`);
      process.exit(1);
    }

    const output = await contextSearch(vault, query, limit);
    process.stdout.write(JSON.stringify(output) + '\n');
  },
};

export default command;
