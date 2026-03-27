// sync-topk — Autonomic skill: append overflow log entries to _topk.<project>.md.
//
// Scans every project note for overflow conditions:
//   connections      > 7
//   callout-flags    > 3
//   children         > 7  (BRANCH notes only)
//
// Deduplicates rows already in the log. Updates `updated:` frontmatter date.
// Idempotent: existing rows for the same note+field are skipped.
//
// Exports:
//   - TopkViolation, detectTopkViolations(notes) — pure function, unit-testable
//   - default Command — CLI entry point

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { logError } from '../lib/logger';
import { obEval, resolveVault } from '../lib/obsidian';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopkNote {
  basename: string;
  type: string;
  childrenCount: number;
  connectionCount: number;
  flagCount: number;
}

export interface TopkViolation {
  note: string;
  field: string;
  count: number;
  threshold: number;
}

// ---------------------------------------------------------------------------
// Pure detection logic
// ---------------------------------------------------------------------------

/** Detect overflow violations from pre-computed note metrics. Pure function. */
export function detectTopkViolations(notes: TopkNote[]): TopkViolation[] {
  const violations: TopkViolation[] = [];
  for (const n of notes) {
    if (n.connectionCount > 7) {
      violations.push({
        note: `[[${n.basename}]]`,
        field: 'connections',
        count: n.connectionCount,
        threshold: 7,
      });
    }
    if (n.flagCount > 3) {
      violations.push({
        note: `[[${n.basename}]]`,
        field: 'callout-flags',
        count: n.flagCount,
        threshold: 3,
      });
    }
    if (n.type === 'BRANCH' && n.childrenCount > 7) {
      violations.push({
        note: `[[${n.basename}]]`,
        field: 'children',
        count: n.childrenCount,
        threshold: 7,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Obsidian interaction (single eval that reads notes + appends to topk file)
// ---------------------------------------------------------------------------

function buildSyncExpr(slug: string): string {
  const jsSlug = encodeForJs(slug);
  return `(async () => {
  var slug = ${jsSlug};
  var projDir = 'projects/' + slug;
  var topkPath = projDir + '/_topk.' + slug + '.md';
  var today = new Date().toISOString().split('T')[0];

  var notes = app.vault.getFiles().filter(function(f) {
    if (f.extension !== 'md') return false;
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_ontology') && !n.startsWith('_vocab') &&
           !n.startsWith('_topk') && !n.startsWith('tpl-');
  });

  var violations = [];
  for (var i = 0; i < notes.length; i++) {
    var f = notes[i];
    var body = await app.vault.cachedRead(f);
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var link = '[[' + f.basename + ']]';

    var connMatches = body.match(/^- [a-z][\\w-]* :: \\[\\[/gm) || [];
    if (connMatches.length > 7)
      violations.push({ note: link, field: 'connections', count: connMatches.length, threshold: 7 });

    var flagMatches = body.match(/^> \\[!flag\\b/gm) || [];
    if (flagMatches.length > 3)
      violations.push({ note: link, field: 'callout-flags', count: flagMatches.length, threshold: 3 });

    var type = fm.type ? String(fm.type) : '';
    if (type === 'BRANCH' && Array.isArray(fm.children) && fm.children.length > 7)
      violations.push({ note: link, field: 'children', count: fm.children.length, threshold: 7 });
  }

  var topkFile = app.vault.getAbstractFileByPath(topkPath);
  if (!topkFile) return JSON.stringify({ error: 'topk file not found: ' + topkPath });

  var appended = 0;
  var warning = '';

  await app.vault.process(topkFile, function(content) {
    var logHeader = '## Overflow Log';
    var logIdx = content.indexOf(logHeader);
    if (logIdx === -1) return content;

    var afterHeader = content.substring(logIdx + logHeader.length);
    var nextMatch = afterHeader.match(/\\n## /);
    var logSection = nextMatch ? afterHeader.substring(0, nextMatch.index) : afterHeader;

    var existingRows = logSection.split('\\n').filter(function(l) { return l.trimStart().charAt(0) === '|'; });
    if (existingRows.length >= 200) {
      warning = 'Overflow log has reached the 200-row cap. Operator cleanup required.';
      return content;
    }

    var newRows = '';
    for (var v = 0; v < violations.length; v++) {
      var viol = violations[v];
      var dup = existingRows.some(function(r) { return r.indexOf(viol.note) !== -1 && r.indexOf(viol.field) !== -1; });
      if (!dup && (existingRows.length + appended) < 200) {
        newRows += '\\n| ' + today + ' | ' + viol.note + ' | ' + viol.field + ' | ' + viol.count + ' | ' + viol.threshold + ' |';
        appended++;
      }
    }
    if (newRows === '') return content;
    if (nextMatch) {
      var insertAt = logIdx + logHeader.length + nextMatch.index;
      return content.substring(0, insertAt) + newRows + content.substring(insertAt);
    }
    return content.trimEnd() + newRows + '\\n';
  });

  var topkAfter = app.vault.getAbstractFileByPath(topkPath);
  if (topkAfter) await app.fileManager.processFrontMatter(topkAfter, function(fm) { fm.updated = today; });

  return JSON.stringify({ appended: appended, warning: warning, noteCount: notes.length });
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

export interface TopkResult {
  noteCount: number;
  appended: number;
  warning: string;
}

/** Run topk overflow detection and append rows. Used by weekly-review. */
export async function syncTopk(vault: string, slug: string): Promise<TopkResult> {
  const raw = await obEval(vault, buildSyncExpr(slug)).catch(() => '');
  if (!raw) throw new Error('sync-topk: Obsidian not reachable or eval failed');
  const data = parseJson<{
    appended?: number;
    warning?: string;
    noteCount?: number;
    error?: string;
  }>(raw);
  if (!data) throw new Error('sync-topk: unexpected response');
  if (data.error) throw new Error(`sync-topk: ${data.error}`);
  return {
    noteCount: data.noteCount ?? 0,
    appended: data.appended ?? 0,
    warning: data.warning ?? '',
  };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'sync-topk',
  description: 'Append overflow log entries to _topk.<project>.md',

  async run(args: string[]): Promise<void> {
    if (args.length < 2) {
      process.stderr.write('Usage: nerv sync-topk <vault|vault=name> <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(args[0]);
    const slug = args[1];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      logError(
        `sync-topk: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    const raw = await obEval(vault, buildSyncExpr(slug)).catch(() => '');
    if (!raw) {
      process.stderr.write('ERROR: sync-topk: Obsidian not reachable or eval failed\n');
      process.exit(1);
    }

    const data = parseJson<{
      appended?: number;
      warning?: string;
      noteCount?: number;
      error?: string;
    }>(raw);
    if (!data) {
      process.stderr.write('ERROR: sync-topk: unexpected response\n');
      process.exit(1);
    }
    if (data.error) {
      process.stderr.write(`ERROR: sync-topk: ${data.error}\n`);
      process.exit(1);
    }

    const n = data.noteCount ?? 0;
    const added = data.appended ?? 0;
    process.stdout.write(
      `sync-topk: ${n} note(s) scanned, ${added} overflow row(s) appended to _topk.${slug}.md\n`
    );
    if (data.warning) {
      process.stdout.write(`WARN: ${data.warning}\n`);
    }
  },
};

export default command;
