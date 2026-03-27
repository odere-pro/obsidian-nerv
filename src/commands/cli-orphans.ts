// cli-orphans — Reflex skill: verify bidirectional parent↔children integrity.
//
// Exports:
//   - OrphanType, OrphanIssue (types)
//   - detectOrphans(notes) — pure function, unit-testable without Obsidian
//   - default Command — CLI entry point

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { obEval, resolveVault } from '../lib/obsidian';
import { extractVaultFlag } from '../lib/vault-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrphanType = 'ORPHAN' | 'BROKEN' | 'MISMATCH' | 'CHILD';

export interface OrphanIssue {
  type: OrphanType;
  note: string;
  detail: string;
}

export interface OrphanResult {
  issues: OrphanIssue[];
  count: number;
  noteCount: number;
}

/** Raw note data returned by the batch obEval call for orphan analysis. */
export interface OrphanNoteData {
  path: string;
  basename: string;
  type: string;
  parent: string;
  /** null = parent wikilink target not found in vault */
  resolvedParentPath: string | null;
  /** basenames of children listed in parent's frontmatter */
  parentChildrenBasenames: string[];
  /** basenames of this note's children[] entries */
  childrenBasenames: (string | null)[]; // null = child wikilink unresolvable
}

// ---------------------------------------------------------------------------
// Pure detection logic
// ---------------------------------------------------------------------------

/** Detect orphan issues from pre-resolved note data. Pure function, no Obsidian. */
export function detectOrphans(notes: OrphanNoteData[]): OrphanIssue[] {
  const issues: OrphanIssue[] = [];

  for (const note of notes) {
    const type = note.type;

    // ORPHAN: BRANCH/LEAF with no parent field
    if ((type === 'BRANCH' || type === 'LEAF') && note.parent.trim() === '') {
      issues.push({ type: 'ORPHAN', note: note.path, detail: `${type} has no parent` });
      continue;
    }

    // BROKEN: parent wikilink resolves to no file
    if ((type === 'BRANCH' || type === 'LEAF') && note.parent.trim() !== '') {
      if (note.resolvedParentPath === null) {
        const rawParent = note.parent
          .replace(/^\[\[/, '')
          .replace(/\]\]$/, '')
          .split('|')[0]
          .trim();
        issues.push({ type: 'BROKEN', note: note.path, detail: `parent "${rawParent}" not found` });
        continue;
      }

      // MISMATCH: parent exists but does not list this note in children
      if (!note.parentChildrenBasenames.includes(note.basename)) {
        const rawParent = note.parent
          .replace(/^\[\[/, '')
          .replace(/\]\]$/, '')
          .split('|')[0]
          .trim();
        issues.push({
          type: 'MISMATCH',
          note: note.path,
          detail: `parent "${rawParent}" does not list this note as a child`,
        });
      }
    }

    // CHILD: children listed that don't exist
    for (let i = 0; i < note.childrenBasenames.length; i++) {
      if (note.childrenBasenames[i] === null) {
        issues.push({
          type: 'CHILD',
          note: note.path,
          detail: `"${note.basename}" lists a child that was not found`,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Obsidian data fetch
// ---------------------------------------------------------------------------

function buildFetchExpr(folder: string): string {
  const jsFolder = encodeForJs(folder);
  return `(async () => {
  var folder = ${jsFolder};
  var allFiles = app.vault.getMarkdownFiles().filter(function(f) {
    if (folder && !f.path.startsWith(folder + '/') && f.path !== folder) return false;
    var n = f.name;
    return !n.startsWith('tpl-') && !n.startsWith('_vocab') &&
           !n.startsWith('_topk') && !n.startsWith('_ontology');
  });

  function resolveLink(linktext, sourcePath) {
    return app.metadataCache.getFirstLinkpathDest(linktext, sourcePath) || null;
  }
  function rawLink(s) {
    return String(s).replace(/^\\[\\[/, '').replace(/\\]\\]$/, '').split('|')[0].trim();
  }

  var notes = allFiles.map(function(f) {
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var type = fm.type ? String(fm.type) : '';
    var parent = fm.parent ? String(fm.parent) : '';

    var resolvedParentPath = null;
    var parentChildrenBasenames = [];
    if (parent.trim() !== '') {
      var pFile = resolveLink(rawLink(parent), f.path);
      if (pFile) {
        resolvedParentPath = pFile.path;
        var pCache = app.metadataCache.getFileCache(pFile);
        var pFm = (pCache && pCache.frontmatter) ? pCache.frontmatter : {};
        var children = Array.isArray(pFm.children) ? pFm.children : [];
        parentChildrenBasenames = children.map(function(c) {
          var cFile = resolveLink(rawLink(String(c)), pFile.path);
          return cFile ? cFile.basename : null;
        }).filter(Boolean);
      }
    }

    var myChildren = Array.isArray(fm.children) ? fm.children : [];
    var childrenBasenames = myChildren.map(function(c) {
      var cFile = resolveLink(rawLink(String(c)), f.path);
      return cFile ? cFile.basename : null;
    });

    return {
      path: f.path,
      basename: f.basename,
      type: type,
      parent: parent,
      resolvedParentPath: resolvedParentPath,
      parentChildrenBasenames: parentChildrenBasenames,
      childrenBasenames: childrenBasenames
    };
  });

  return JSON.stringify(notes);
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/** Run orphan detection against a vault folder. Used by weekly-review. */
export async function findOrphans(vault: string, folder: string): Promise<OrphanResult> {
  const raw = await obEval(vault, buildFetchExpr(folder)).catch(() => '[]');
  const rawNotes = parseJson<OrphanNoteData[]>(raw) ?? [];
  const issues = detectOrphans(rawNotes);
  return { issues, count: issues.length, noteCount: rawNotes.length };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'cli-orphans',
  description: 'Verify bidirectional parent↔children integrity of vault notes',

  async run(args: string[]): Promise<void> {
    let jsonOutput = false;
    let projectFilter = '';
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];

    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--json') {
        jsonOutput = true;
      } else if (rest[i] === '--project' && rest[i + 1]) {
        projectFilter = `projects/${rest[++i]}`;
      } else {
        positional.push(rest[i]);
      }
    }

    const vault = await resolveVault(vaultArg);
    const folder = projectFilter || positional[0] || '';
    const raw = await obEval(vault, buildFetchExpr(folder)).catch(() => '[]');
    const rawNotes = parseJson<OrphanNoteData[]>(raw) ?? [];
    const issues = detectOrphans(rawNotes);

    const result: OrphanResult = { issues, count: issues.length, noteCount: rawNotes.length };

    if (jsonOutput) {
      // omit noteCount from JSON output
      process.stdout.write(JSON.stringify({ issues: result.issues, count: result.count }) + '\n');
    } else {
      const labels: Record<OrphanType, string> = {
        ORPHAN: '✗ ORPHAN',
        BROKEN: '✗ BROKEN',
        MISMATCH: '✗ MISMATCH',
        CHILD: '✗ BROKEN',
      };
      for (const iss of issues) {
        process.stdout.write(`${labels[iss.type]}: ${iss.note} — ${iss.detail}\n`);
      }
      process.stdout.write(
        `Link check complete. ${issues.length} issue(s) in ${rawNotes.length} note(s).\n`
      );
    }
  },
};

export default command;
