// sync-vocab — Autonomic skill: rebuild _vocab.<project>.md from note metadata.
//
// Exports:
//   - VocabNote, VocabResult (types)
//   - buildVocabContent(notes, slug) — pure function, unit-testable without Obsidian
//   - default Command — CLI entry point
//
// Idempotent: full regeneration on every run. Updates `updated:` frontmatter date.

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { logError } from '../lib/logger';
import { obEval, resolveVault } from '../lib/obsidian';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pure content builder
// ---------------------------------------------------------------------------

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
    if (e.type === 'BRANCH' && e.childrenCount > 7)
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

// ---------------------------------------------------------------------------
// Obsidian interaction
// ---------------------------------------------------------------------------

function buildSyncExpr(slug: string, newBody: string): string {
  const jsSlug = encodeForJs(slug);
  const jsBody = encodeForJs(newBody);
  const today = new Date().toISOString().split('T')[0];
  const jsToday = encodeForJs(today);
  return `(async () => {
  var slug = ${jsSlug};
  var vocabPath = 'projects/' + slug + '/_vocab.' + slug + '.md';
  var today = ${jsToday};
  var newBody = ${jsBody};
  var f = app.vault.getAbstractFileByPath(vocabPath);
  if (f) {
    await app.vault.modify(f, newBody);
    var f2 = app.vault.getAbstractFileByPath(vocabPath);
    if (f2) await app.fileManager.processFrontMatter(f2, function(fm) { fm.updated = today; });
  } else {
    await app.vault.create(vocabPath, newBody);
  }
  return 'ok';
})()`;
}

function buildFetchExpr(slug: string): string {
  const jsSlug = encodeForJs(slug);
  return `(async () => {
  var slug = ${jsSlug};
  var projDir = 'projects/' + slug;
  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab') && !n.startsWith('_topk') &&
           !n.startsWith('_ontology') && !n.startsWith('tpl-');
  });
  var result = notes.map(function(f) {
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    return {
      basename: f.basename,
      type: fm.type ? String(fm.type) : 'LEAF',
      spine: fm.spine ? String(fm.spine) : '',
      status: fm.status ? String(fm.status) : 'draft',
      childrenCount: Array.isArray(fm.children) ? fm.children.length : 0
    };
  });
  return JSON.stringify(result);
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/** Rebuild _vocab file for a project. Used by weekly-review. */
export async function syncVocab(vault: string, slug: string): Promise<VocabResult> {
  const raw = await obEval(vault, buildFetchExpr(slug)).catch(() => '');
  if (!raw) throw new Error('sync-vocab: Obsidian not reachable or eval failed');
  const notes = parseJson<VocabNote[]>(raw) ?? [];
  const newBody = buildVocabContent(notes, slug);
  await obEval(vault, buildSyncExpr(slug, newBody));
  const entryCount = notes.filter(n => n.spine).length;
  const orphanCount = notes.filter(n => !n.spine).length;
  return { noteCount: notes.length, entryCount, orphanCount };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'sync-vocab',
  description: 'Rebuild _vocab.<project>.md from note metadata',

  async run(args: string[]): Promise<void> {
    if (args.length < 2) {
      process.stderr.write('Usage: nerv sync-vocab <vault|vault=name> <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(args[0]);
    const slug = args[1];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      logError(
        `sync-vocab: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    const raw = await obEval(vault, buildFetchExpr(slug)).catch(() => '');
    if (!raw) {
      process.stderr.write('ERROR: sync-vocab: Obsidian not reachable or eval failed\n');
      process.exit(1);
    }

    const notes = parseJson<VocabNote[]>(raw) ?? [];
    const newBody = buildVocabContent(notes, slug);

    await obEval(vault, buildSyncExpr(slug, newBody)).catch(() => {
      process.stderr.write('ERROR: sync-vocab: failed to write vocab file\n');
      process.exit(1);
    });

    const entryCount = notes.filter(n => n.spine).length;
    const orphanCount = notes.filter(n => !n.spine).length;
    process.stdout.write(
      `sync-vocab: ${notes.length} note(s) scanned, ${entryCount} vocab entries, ${orphanCount} orphan(s) written to _vocab.${slug}.md\n`
    );
  },
};

export default command;
