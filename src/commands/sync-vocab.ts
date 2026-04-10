/**
 * sync-vocab — Autonomic skill: rebuild _vocab.<project>.md from note metadata.
 *
 * Exports:
 *   - VocabNote, VocabResult (types)
 *   - buildVocabContent(notes, slug) — pure function, unit-testable without Obsidian
 *   - default Command — CLI entry point
 *
 * Idempotent: full regeneration on every run. Updates `updated:` frontmatter date.
 */

import { CHILDREN_LIMIT, isEntityNote } from '../constants/limits';
import { logError } from '../lib/logger';
import { getVaultOps } from '../ports/provider';
import type { VaultOps } from '../ports/vault-ops';
import { BaseCommand, type CommandContext } from './base-command';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface VocabNote {
  basename: string;
  type: string;
  spine: string;
  status: string;
  childrenCount: number;
}

export interface VocabResult {
  noteCount: number;
  entryCount: number;
  orphanCount: number;
}

/* ---------------------------------------------------------------------------
 * Pure content builder
 * --------------------------------------------------------------------------- */

const TYPE_ORDER: Record<string, number> = { ROOT: 0, BRANCH: 1, LEAF: 2 };

/** Build the full _vocab.<slug>.md markdown content from note metadata. Pure function. */
export function buildVocabContent(notes: VocabNote[], slug: string): string {
  const entries: VocabNote[] = [];
  const orphanLinks: string[] = [];

  for (const n of notes) {
    if (!n.spine) {
      orphanLinks.push(`[[${n.basename}]]`);
    } else {
      entries.push(n);
    }
  }

  entries.sort((a, b) => {
    if (a.spine < b.spine) return -1;
    if (a.spine > b.spine) return 1;
    const to = (TYPE_ORDER[a.type] ?? 2) - (TYPE_ORDER[b.type] ?? 2);
    if (to !== 0) return to;
    return a.basename < b.basename ? -1 : 1;
  });

  const lines: string[] = [`# Vocabulary — ${slug}`, ''];
  let currentSpine = '';

  for (const e of entries) {
    if (e.spine !== currentSpine) {
      if (currentSpine !== '') lines.push('');
      lines.push(`## ${e.spine}`, '');
      currentSpine = e.spine;
    }
    let overflow = '';
    if (e.type === 'BRANCH' && e.childrenCount > CHILDREN_LIMIT)
      overflow = ` ⚠ overflow (children: ${e.childrenCount})`;
    if (e.type === 'LEAF' && e.childrenCount > 5)
      overflow = ` ⚠ overflow (children: ${e.childrenCount})`;
    lines.push(`- [[${e.basename}]] (${e.type}, ${e.status})${overflow}`);
  }

  if (orphanLinks.length > 0) {
    lines.push('', '## Orphan Terms', '');
    for (const o of orphanLinks) lines.push(`- ${o}`);
  }

  lines.push('');
  return lines.join('\n');
}

/* ---------------------------------------------------------------------------
 * VaultOps data fetch
 * --------------------------------------------------------------------------- */

function fetchVocabNotes(
  entries: { path: string; frontmatter: Record<string, unknown> }[]
): VocabNote[] {
  return entries
    .filter(e => {
      const name = e.path.split('/').pop() ?? '';
      return isEntityNote(name);
    })
    .map(e => {
      const fm = e.frontmatter;
      const basename = (e.path.split('/').pop() ?? '').replace(/\.md$/, '');
      return {
        basename,
        type: fm.type ? String(fm.type) : 'LEAF',
        spine: fm.spine ? String(fm.spine) : '',
        status: fm.status ? String(fm.status) : 'draft',
        childrenCount: Array.isArray(fm.children) ? fm.children.length : 0,
      };
    });
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

/** Rebuild _vocab file for a project. Used by weekly-review. */
export async function syncVocab(
  vault: string,
  slug: string,
  injectedOps?: VaultOps
): Promise<VocabResult> {
  const ops = injectedOps ?? getVaultOps();
  const allFiles = await ops.listFiles(vault, { folder: `projects/${slug}` });
  const notes = fetchVocabNotes(allFiles);
  if (notes.length === 0) throw new Error('sync-vocab: no notes found or vault not reachable');

  const newBody = buildVocabContent(notes, slug);
  const vocabPath = `projects/${slug}/_vocab.${slug}.md`;
  const today = new Date().toISOString().split('T')[0];

  const exists = await ops.fileExists(vault, vocabPath);
  if (exists) {
    await ops.replaceFileContent(vault, vocabPath, newBody);
  } else {
    await ops.createFile(vault, vocabPath, newBody);
  }
  if (await ops.fileExists(vault, vocabPath)) {
    await ops.updateFrontmatter(vault, vocabPath, { updated: today });
  }

  const entryCount = notes.filter(n => n.spine).length;
  const orphanCount = notes.filter(n => !n.spine).length;
  return { noteCount: notes.length, entryCount, orphanCount };
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

class SyncVocabCommand extends BaseCommand {
  readonly name = 'sync-vocab';
  readonly description = 'Rebuild _vocab.<project>.md from note metadata';
  readonly usage = 'nerv sync-vocab [--vault <name>] <project_slug>';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    const slug = ctx.positional[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      logError(
        `sync-vocab: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    try {
      const result = await syncVocab(ctx.vault, slug);
      process.stdout.write(
        `sync-vocab: ${result.noteCount} note(s) scanned, ${result.entryCount} vocab entries, ${result.orphanCount} orphan(s) written to _vocab.${slug}.md\n`
      );
    } catch (err) {
      ctx.out.error(err instanceof Error ? err.message : String(err));
    }
  }
}

export default new SyncVocabCommand();
