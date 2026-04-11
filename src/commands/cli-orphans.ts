/**
 * cli-orphans — Reflex skill: verify bidirectional parent↔children integrity.
 *
 * Exports:
 *   - OrphanType, OrphanIssue (types)
 *   - detectOrphans(notes) — pure function, unit-testable without Obsidian
 *   - default Command — CLI entry point
 */

import { isEntityNote } from '../constants/limits';
import { stripWikilink } from '../lib/markdown';
import { getVaultOps } from '../ports/provider';
import type { VaultFileEntry, VaultOps } from '../ports/vault-ops';
import { BaseCommand, type CommandContext } from './base-command';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

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
  /** null = child wikilink unresolvable */
  childrenBasenames: (string | null)[];
}

/* ---------------------------------------------------------------------------
 * Pure detection logic
 * --------------------------------------------------------------------------- */

/** Detect orphan issues from pre-resolved note data. Pure function, no Obsidian. */
export function detectOrphans(notes: OrphanNoteData[]): OrphanIssue[] {
  const issues: OrphanIssue[] = [];

  for (const note of notes) {
    const type = note.type;

    /* ORPHAN: BRANCH/LEAF with no parent field */
    if ((type === 'BRANCH' || type === 'LEAF') && note.parent.trim() === '') {
      issues.push({ type: 'ORPHAN', note: note.path, detail: `${type} has no parent` });
      continue;
    }

    /* BROKEN: parent wikilink resolves to no file */
    if ((type === 'BRANCH' || type === 'LEAF') && note.parent.trim() !== '') {
      if (note.resolvedParentPath === null) {
        const rawParent = stripWikilink(note.parent);
        issues.push({ type: 'BROKEN', note: note.path, detail: `parent "${rawParent}" not found` });
        continue;
      }

      /* MISMATCH: parent exists but does not list this note in children */
      if (!note.parentChildrenBasenames.includes(note.basename)) {
        const rawParent = stripWikilink(note.parent);
        issues.push({
          type: 'MISMATCH',
          note: note.path,
          detail: `parent "${rawParent}" does not list this note as a child`,
        });
      }
    }

    /* CHILD: children listed that don't exist */
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

/* ---------------------------------------------------------------------------
 * VaultOps data fetch + wikilink resolution in TypeScript
 * --------------------------------------------------------------------------- */

const rawLink = stripWikilink;

function buildOrphanNotes(allEntries: VaultFileEntry[], folder: string): OrphanNoteData[] {
  /* Build basename → entry map for wikilink resolution */
  const basenameMap = new Map<string, VaultFileEntry>();
  for (const entry of allEntries) {
    const bn = (entry.path.split('/').pop() ?? '').replace(/\.md$/, '');
    basenameMap.set(bn, entry);
  }

  /* Filter project notes */
  const entries = allEntries.filter(e => {
    if (folder && !e.path.startsWith(folder + '/') && e.path !== folder) return false;
    const name = e.path.split('/').pop() ?? '';
    return isEntityNote(name);
  });

  return entries.map(e => {
    const basename = (e.path.split('/').pop() ?? '').replace(/\.md$/, '');
    const fm = e.frontmatter;
    const type = fm.type ? String(fm.type) : '';
    const parent = fm.parent ? String(fm.parent) : '';

    let resolvedParentPath: string | null = null;
    let parentChildrenBasenames: string[] = [];

    if (parent.trim() !== '') {
      const parentBn = rawLink(parent);
      const parentEntry = basenameMap.get(parentBn);
      if (parentEntry) {
        resolvedParentPath = parentEntry.path;
        const pFm = parentEntry.frontmatter;
        const children = Array.isArray(pFm.children) ? pFm.children : [];
        parentChildrenBasenames = children
          .map((c: unknown) => {
            const cBn = rawLink(String(c));
            return basenameMap.has(cBn) ? cBn : null;
          })
          .filter((b): b is string => b !== null);
      }
    }

    const myChildren = Array.isArray(fm.children) ? fm.children : [];
    const childrenBasenames: (string | null)[] = myChildren.map((c: unknown) => {
      const cBn = rawLink(String(c));
      return basenameMap.has(cBn) ? cBn : null;
    });

    return {
      path: e.path,
      basename,
      type,
      parent,
      resolvedParentPath,
      parentChildrenBasenames,
      childrenBasenames,
    };
  });
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

/** Run orphan detection against a vault folder. Used by weekly-review. */
export async function findOrphans(
  vault: string,
  folder: string,
  injectedOps?: VaultOps
): Promise<OrphanResult> {
  const ops = injectedOps ?? getVaultOps();
  const listFilter = folder ? { folder } : undefined;
  const allEntries = await ops.listFiles(vault, listFilter).catch(() => []);
  const notes = buildOrphanNotes(allEntries, folder);
  const issues = detectOrphans(notes);
  return { issues, count: issues.length, noteCount: notes.length };
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

class CliOrphansCommand extends BaseCommand {
  readonly name = 'cli-orphans';
  readonly description = 'Verify bidirectional parent↔children integrity of vault notes';
  readonly usage = 'nerv cli-orphans [--vault <name>] [--project <slug>] [--json]';
  readonly minPositional = 0;

  protected async execute(ctx: CommandContext): Promise<void> {
    let projectFilter = '';
    const positional: string[] = [];

    for (let i = 0; i < ctx.positional.length; i++) {
      if (ctx.positional[i] === '--project' && ctx.positional[i + 1]) {
        projectFilter = `projects/${ctx.positional[++i]}`;
      } else {
        positional.push(ctx.positional[i]);
      }
    }

    const folder = projectFilter || positional[0] || '';
    const result = await findOrphans(ctx.vault, folder);

    if (ctx.jsonOutput) {
      ctx.out.success({ issues: result.issues, count: result.count });
    } else {
      const labels: Record<OrphanType, string> = {
        ORPHAN: '✗ ORPHAN',
        BROKEN: '✗ BROKEN',
        MISMATCH: '✗ MISMATCH',
        CHILD: '✗ BROKEN',
      };
      const lines: string[] = [];
      for (const iss of result.issues) {
        lines.push(`${labels[iss.type]}: ${iss.note} — ${iss.detail}`);
      }
      lines.push(`Link check complete. ${result.count} issue(s) in ${result.noteCount} note(s).`);
      ctx.out.success(lines.join('\n'));
    }
  }
}

export default new CliOrphansCommand();
