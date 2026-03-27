// cli-lint — Reflex skill: validate frontmatter and structure of vault notes.
//
// Exports:
//   - NoteData, ConnectionLine, Violation, ViolationRule (types)
//   - VIOLATION_RULES (the 11 pure rule functions, unit-testable without Obsidian)
//   - lintProject(vault, folder?) — programmatic API used by weekly-review
//   - default Command — CLI entry point for the dispatcher

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { obEval, resolveVault } from '../lib/obsidian';
import { extractVaultFlag } from '../lib/vault-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionLine {
  rel: string;
  target: string;
  context: string;
  typed: boolean;
}

/** Raw note data returned by the batch obEval call. */
export interface NoteData {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string; // body text with YAML frontmatter stripped
  connections: ConnectionLine[];
  backlinks: string[];
}

export interface Violation {
  note: string;
  rule: string;
  detail: string;
}

export type ViolationRule = (note: NoteData) => Violation | null;

export interface LintResult {
  vault: string;
  folder: string;
  issues: Violation[];
  count: number;
  noteCount: number;
}

// ---------------------------------------------------------------------------
// Body parsing helpers
// ---------------------------------------------------------------------------

/** Extract the body of a named ## section from note body text. */
export function extractSection(body: string, heading: string): string {
  const sections = body.split(/\n(?=## )/);
  for (const sec of sections) {
    if (new RegExp(`^## ${heading}\\b`).test(sec)) {
      return sec.replace(new RegExp(`^## ${heading}\\n?`), '');
    }
  }
  return '';
}

/** Parse typed and untyped connection lines from the ## Connections section body. */
export function parseConnections(body: string): ConnectionLine[] {
  const connSection = extractSection(body, 'Connections');
  const typedRe = /^- ([a-z][a-z0-9-]*) :: \[\[([^\]]+)\]\](?:\s*—\s*(.*))?$/;
  const result: ConnectionLine[] = [];
  for (const line of connSection.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    if (trimmed === '-') continue;
    const m = trimmed.match(typedRe);
    if (m) {
      result.push({ rel: m[1], target: m[2], context: m[3] ?? '', typed: true });
    } else if (trimmed.includes('[[')) {
      result.push({ rel: '', target: '', context: trimmed, typed: false });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// The 11 violation rules — pure functions on NoteData
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['title', 'type', 'kind', 'spine', 'status', 'created', 'aliases'];

function fm(note: NoteData, key: string): string {
  const v = note.frontmatter[key];
  return v !== undefined && v !== null ? String(v) : '';
}

function rulesMissingField(note: NoteData): Violation | null {
  for (const field of REQUIRED_FIELDS) {
    const v = note.frontmatter[field];
    if (v === undefined || v === null || v === '') {
      return { note: note.path, rule: 'missing-field', detail: `Missing required field: ${field}` };
    }
  }
  return null;
}

function rulesRootHasParent(note: NoteData): Violation | null {
  if (fm(note, 'type') === 'ROOT' && fm(note, 'parent').trim() !== '') {
    return { note: note.path, rule: 'root-has-parent', detail: 'ROOT note must not have a parent' };
  }
  return null;
}

function rulesMissingParent(note: NoteData): Violation | null {
  const type = fm(note, 'type');
  if ((type === 'BRANCH' || type === 'LEAF') && fm(note, 'parent').trim() === '') {
    return {
      note: note.path,
      rule: 'missing-parent',
      detail: `${type} note must have a non-empty parent`,
    };
  }
  return null;
}

function rulesEmptyChildren(note: NoteData): Violation | null {
  const children = note.frontmatter['children'];
  if (fm(note, 'type') === 'BRANCH' && (!Array.isArray(children) || children.length === 0)) {
    return {
      note: note.path,
      rule: 'empty-children',
      detail: 'BRANCH note has an empty children array',
    };
  }
  return null;
}

function rulesSpineInBody(note: NoteData): Violation | null {
  const spine = fm(note, 'spine');
  if (!spine) return null;
  const spineTag = `#${spine}`;
  const body = note.body;
  if (
    body.includes(`${spineTag} `) ||
    body.includes(`${spineTag}\n`) ||
    body.includes(`${spineTag}\t`) ||
    body.endsWith(spineTag)
  ) {
    return {
      note: note.path,
      rule: 'spine-in-body',
      detail: `Spine tag #${spine} found in body; use frontmatter spine field`,
    };
  }
  return null;
}

function rulesLegacyFlagTag(note: NoteData): Violation | null {
  if (note.body.includes('#flag/')) {
    return {
      note: note.path,
      rule: 'legacy-flag-tag',
      detail: 'Legacy #flag/ tag in body; use > [!flag] callout instead',
    };
  }
  return null;
}

function rulesLegacyStatusTag(note: NoteData): Violation | null {
  if (note.body.includes('#status/')) {
    return {
      note: note.path,
      rule: 'legacy-status-tag',
      detail: 'Legacy #status/ tag in body; use status frontmatter field instead',
    };
  }
  return null;
}

function rulesUntypedConnection(note: NoteData): Violation | null {
  const untyped = note.connections.find(c => !c.typed);
  if (untyped) {
    return {
      note: note.path,
      rule: 'untyped-connection',
      detail: `Untyped connection: ${untyped.context.substring(0, 80)}`,
    };
  }
  return null;
}

function rulesConnectionLimit(note: NoteData): Violation | null {
  const typedCount = note.connections.filter(c => c.typed).length;
  if (typedCount > 7) {
    return {
      note: note.path,
      rule: 'connection-limit',
      detail: `Connection count ${typedCount} exceeds limit of 7`,
    };
  }
  return null;
}

function rulesMissingBreadcrumb(note: NoteData): Violation | null {
  const type = fm(note, 'type');
  if ((type === 'BRANCH' || type === 'LEAF') && !note.body.includes('## Breadcrumb')) {
    return {
      note: note.path,
      rule: 'missing-breadcrumb',
      detail: `${type} note is missing ## Breadcrumb section`,
    };
  }
  return null;
}

function rulesFlagLimit(note: NoteData): Violation | null {
  const matches = note.body.match(/^> \[!flag\b/gm) ?? [];
  if (matches.length > 3) {
    return {
      note: note.path,
      rule: 'flag-limit',
      detail: `Callout flag count ${matches.length} exceeds limit of 3`,
    };
  }
  return null;
}

/** The 11 violation rules in order. Each is a pure function of NoteData. */
export const VIOLATION_RULES: ViolationRule[] = [
  rulesMissingField,
  rulesRootHasParent,
  rulesMissingParent,
  rulesEmptyChildren,
  rulesSpineInBody,
  rulesLegacyFlagTag,
  rulesLegacyStatusTag,
  rulesUntypedConnection,
  rulesConnectionLimit,
  rulesMissingBreadcrumb,
  rulesFlagLimit,
];

// ---------------------------------------------------------------------------
// Obsidian data fetch
// ---------------------------------------------------------------------------

interface RawNote {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

function buildFetchExpr(folder: string): string {
  const jsFolder = encodeForJs(folder);
  return `(async () => {
  var folder = ${jsFolder};
  var files = app.vault.getFiles().filter(function(f) {
    if (f.extension !== 'md') return false;
    if (folder && !f.path.startsWith(folder + '/') && f.path !== folder) return false;
    var n = f.name;
    return !n.startsWith('tpl-') && !n.startsWith('_vocab') &&
           !n.startsWith('_topk') && !n.startsWith('_ontology');
  });
  var notes = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var raw = await app.vault.cachedRead(f);
    var body = raw.replace(/^---[\\s\\S]*?---\\n?/, '');
    notes.push({ path: f.path, frontmatter: fm, body: body });
  }
  return JSON.stringify(notes);
})()`;
}

function toNoteData(raw: RawNote): NoteData {
  const connections = parseConnections(raw.body);
  return {
    path: raw.path,
    frontmatter: raw.frontmatter,
    body: raw.body,
    connections,
    backlinks: [],
  };
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/** Lint all notes in the vault (or a folder) and return structured results. */
export async function lintProject(vault: string, folder = ''): Promise<LintResult> {
  const raw = await obEval(vault, buildFetchExpr(folder)).catch(() => '[]');
  const rawNotes = parseJson<RawNote[]>(raw) ?? [];
  const notes = rawNotes.map(toNoteData);

  const issues: Violation[] = [];
  for (const note of notes) {
    for (const rule of VIOLATION_RULES) {
      const v = rule(note);
      if (v) issues.push(v);
    }
  }

  return { vault, folder, issues, count: issues.length, noteCount: notes.length };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'cli-lint',
  description: 'Validate frontmatter and structure of vault notes',

  async run(args: string[]): Promise<void> {
    let jsonOutput = false;
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];
    for (const a of rest) {
      if (a === '--json') jsonOutput = true;
      else positional.push(a);
    }

    const vault = await resolveVault(vaultArg);
    const folder = positional[0] ?? '';
    const result = await lintProject(vault, folder);

    if (jsonOutput) {
      process.stdout.write(
        JSON.stringify({
          vault: result.vault,
          folder: result.folder,
          issues: result.issues,
          count: result.count,
        }) + '\n'
      );
    } else {
      for (const iss of result.issues) {
        process.stdout.write(`⚠ ${iss.note}: [${iss.rule}] ${iss.detail}\n`);
      }
      process.stdout.write(
        `Lint complete. ${result.count} issue(s) in ${result.noteCount} note(s).\n`
      );
    }
  },
};

export default command;
