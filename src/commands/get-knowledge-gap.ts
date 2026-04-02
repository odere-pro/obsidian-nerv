/**
 * get-knowledge-gap — Sensory skill: identify structural deficiencies in a project.
 *
 * Exports:
 *   - GapNote (input type for gap analysis functions)
 *   - StubEntry, DraftEntry, MissingFieldEntry, LowLinkEntry, UnresolvedLinkEntry (output types)
 *   - KnowledgeGapResult (full output type)
 *   - detectGaps(notes) — pure gap-analysis function, zero side effects
 *   - getKnowledgeGap(vault, slug) — programmatic API
 *   - default Command — CLI entry point
 *
 * Gap categories:
 *   stubs          — body word count < 100 (frontmatter excluded)
 *   noConnections  — notes with zero typed connections
 *   drafts         — notes whose status === 'draft'
 *   missingFields  — notes missing any required frontmatter field
 *   lowLinkCount   — ROOT or BRANCH with < 2 typed connections
 *   unresolvedLinks — notes containing broken wikilinks (pre-resolved by Obsidian in fetch)
 */

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { obEval, resolveVault } from '../lib/obsidian';
import { extractVaultFlag } from '../lib/vault-registry';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

/** Flat note representation used by the pure gap analysis functions. */
export interface GapNote {
  basename: string;
  type: string;
  kind: string;
  spine: string;
  status: string;
  frontmatter: Record<string, unknown>;
  /** body text with YAML frontmatter stripped */
  body: string;
  /** count of typed "rel :: [[target]]" lines in ## Connections */
  typedConnections: number;
  /** wikilinks for which Obsidian returned no file (pre-resolved) */
  brokenLinks: string[];
}

export interface StubEntry {
  note: string;
  words: number;
}

export interface DraftEntry {
  note: string;
  kind: string;
  spine: string;
}

export interface MissingFieldEntry {
  note: string;
  missing: string[];
}

export interface LowLinkEntry {
  note: string;
  links: number;
}

export interface UnresolvedLinkEntry {
  note: string;
  broken: string[];
}

export interface KnowledgeGapResult {
  stubs: StubEntry[];
  noConnections: string[];
  drafts: DraftEntry[];
  missingFields: MissingFieldEntry[];
  lowLinkCount: LowLinkEntry[];
  unresolvedLinks: UnresolvedLinkEntry[];
}

/* ---------------------------------------------------------------------------
 * Pure gap analysis function
 * --------------------------------------------------------------------------- */

const REQUIRED_FIELDS = ['title', 'type', 'kind', 'spine', 'status', 'created', 'aliases'];

/**
 * Analyse a list of notes and return all gap categories.
 *
 * Pure function — no I/O, no Obsidian required. The caller is responsible for
 * pre-resolving broken wikilinks and providing them in `note.brokenLinks`.
 */
export function detectGaps(notes: GapNote[]): KnowledgeGapResult {
  const stubs: StubEntry[] = [];
  const noConnections: string[] = [];
  const drafts: DraftEntry[] = [];
  const missingFields: MissingFieldEntry[] = [];
  const lowLinkCount: LowLinkEntry[] = [];
  const unresolvedLinks: UnresolvedLinkEntry[] = [];

  for (const note of notes) {
    /* Stubs: body word count < 100 */
    const words = note.body.trim().split(/\s+/).filter(Boolean);
    if (words.length < 100) {
      stubs.push({ note: note.basename, words: words.length });
    }

    /* No typed connections */
    if (note.typedConnections === 0) {
      noConnections.push(note.basename);
    }

    /* Draft status */
    if (note.status === 'draft') {
      drafts.push({ note: note.basename, kind: note.kind, spine: note.spine });
    }

    /* Missing required fields */
    const missing = REQUIRED_FIELDS.filter(field => {
      const v = note.frontmatter[field];
      return v === undefined || v === null || v === '';
    });
    if (missing.length > 0) {
      missingFields.push({ note: note.basename, missing });
    }

    /* Low link count: ROOT or BRANCH with < 2 typed connections */
    if ((note.type === 'ROOT' || note.type === 'BRANCH') && note.typedConnections < 2) {
      lowLinkCount.push({ note: note.basename, links: note.typedConnections });
    }

    /* Unresolved wikilinks */
    if (note.brokenLinks.length > 0) {
      unresolvedLinks.push({ note: note.basename, broken: note.brokenLinks });
    }
  }

  return { stubs, noConnections, drafts, missingFields, lowLinkCount, unresolvedLinks };
}

/* ---------------------------------------------------------------------------
 * Obsidian data fetch
 * --------------------------------------------------------------------------- */

function buildFetchExpr(slug: string): string {
  const jsSlug = encodeForJs(slug);
  return `(async () => {
  var slug    = ${jsSlug};
  var projDir = 'projects/' + slug;
  var REQUIRED = ['title', 'type', 'kind', 'spine', 'status', 'created', 'aliases'];

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  var result = [];
  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var raw   = await app.vault.cachedRead(f);
    var body  = raw.replace(/^---[\\s\\S]*?---\\n?/, '');

    /* Count typed connections in ## Connections section */
    var sections = body.split(/\\n(?=## )/);
    var connSection = '';
    for (var s = 0; s < sections.length; s++) {
      if (/^## Connections\\b/.test(sections[s])) {
        connSection = sections[s].replace(/^## Connections\\n?/, '');
        break;
      }
    }
    var typedConns = (connSection.match(/^- [a-z][a-z0-9-]* :: \\[\\[/gm) || []).length;

    /* Broken wikilinks via getFirstLinkpathDest */
    var linkRe = /\\[\\[([^\\]|]+)(?:\\|[^\\]]+)?\\]\\]/g;
    var broken = [];
    var lm;
    while ((lm = linkRe.exec(body)) !== null) {
      var target = lm[1].trim();
      if (!app.metadataCache.getFirstLinkpathDest(target, f.path)) {
        broken.push('[[' + lm[1] + ']]');
      }
    }

    var fmOut = {};
    var keys = Object.keys(fm);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] !== 'position') fmOut[keys[k]] = fm[keys[k]];
    }

    result.push({
      basename:         f.basename,
      type:             String(fm.type   || ''),
      kind:             String(fm.kind   || ''),
      spine:            String(fm.spine  || ''),
      status:           String(fm.status || ''),
      frontmatter:      fmOut,
      body:             body,
      typedConnections: typedConns,
      brokenLinks:      broken
    });
  }
  return JSON.stringify(result);
})()`;
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

export async function getKnowledgeGap(vault: string, slug: string): Promise<KnowledgeGapResult> {
  const raw = await obEval(vault, buildFetchExpr(slug)).catch(() => '[]');
  const notes = parseJson<GapNote[]>(raw) ?? [];
  return detectGaps(notes);
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

const command: Command = {
  name: 'get-knowledge-gap',
  description: 'Identify structural deficiencies (stubs, gaps, broken links) in a project',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 1) {
      process.stderr.write('Usage: nerv get-knowledge-gap [--vault <name>] <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const slug = rest[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      process.stderr.write(
        'ERROR: get-knowledge-gap: project slug must be lowercase alphanumeric with hyphens\n'
      );
      process.exit(1);
    }

    const result = await getKnowledgeGap(vault, slug);
    process.stdout.write(JSON.stringify(result) + '\n');
  },
};

export default command;
