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
import { logError } from '../lib/logger';
import { resolveVault } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import { extractVaultFlag } from '../lib/vault-registry';

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
// VaultOps data fetch + log update
// ---------------------------------------------------------------------------

const EXCLUDED_PREFIXES = ['_ontology', '_vocab', '_topk', 'tpl-'];

const CONN_RE = /^- [a-z][\w-]* :: \[\[/gm;
const FLAG_RE = /^> \[!flag\b/gm;

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
}

async function runSync(
  vault: string,
  slug: string
): Promise<{ noteCount: number; appended: number; warning: string }> {
  const ops = getVaultOps();
  const projDir = `projects/${slug}`;
  const topkPath = `${projDir}/_topk.${slug}.md`;
  const today = new Date().toISOString().split('T')[0];

  // List all project notes
  const allFiles = await ops.listFiles(vault);
  const noteEntries = allFiles.filter(e => {
    if (!e.path.startsWith(projDir + '/')) return false;
    const name = e.path.split('/').pop() ?? '';
    return !EXCLUDED_PREFIXES.some(p => name.startsWith(p));
  });

  // Read each note body to compute metrics
  const violations: TopkViolation[] = [];
  for (const entry of noteEntries) {
    const file = await ops.readFile(vault, entry.path);
    const body = stripFrontmatter(file.content);
    const basename = (entry.path.split('/').pop() ?? '').replace(/\.md$/, '');
    const link = `[[${basename}]]`;

    const connMatches = body.match(CONN_RE) ?? [];
    if (connMatches.length > 7) {
      violations.push({
        note: link,
        field: 'connections',
        count: connMatches.length,
        threshold: 7,
      });
    }

    const flagMatches = body.match(FLAG_RE) ?? [];
    if (flagMatches.length > 3) {
      violations.push({
        note: link,
        field: 'callout-flags',
        count: flagMatches.length,
        threshold: 3,
      });
    }

    const fm = entry.frontmatter;
    const type = fm.type ? String(fm.type) : '';
    if (type === 'BRANCH' && Array.isArray(fm.children) && fm.children.length > 7) {
      violations.push({ note: link, field: 'children', count: fm.children.length, threshold: 7 });
    }
  }

  // Read existing topk file
  const topkExists = await ops.fileExists(vault, topkPath);
  if (!topkExists) {
    return {
      noteCount: noteEntries.length,
      appended: 0,
      warning: `topk file not found: ${topkPath}`,
    };
  }

  const topkFile = await ops.readFile(vault, topkPath);
  let content = topkFile.content;

  const logHeader = '## Overflow Log';
  const logIdx = content.indexOf(logHeader);
  if (logIdx === -1) {
    return { noteCount: noteEntries.length, appended: 0, warning: '' };
  }

  const afterHeader = content.substring(logIdx + logHeader.length);
  const nextMatch = afterHeader.match(/\n## /);
  const logSection = nextMatch ? afterHeader.substring(0, nextMatch.index) : afterHeader;

  const existingRows = logSection.split('\n').filter(l => l.trimStart().charAt(0) === '|');
  if (existingRows.length >= 200) {
    return {
      noteCount: noteEntries.length,
      appended: 0,
      warning: 'Overflow log has reached the 200-row cap. Operator cleanup required.',
    };
  }

  let appended = 0;
  let newRows = '';
  for (const viol of violations) {
    const dup = existingRows.some(r => r.indexOf(viol.note) !== -1 && r.indexOf(viol.field) !== -1);
    if (!dup && existingRows.length + appended < 200) {
      newRows += `\n| ${today} | ${viol.note} | ${viol.field} | ${viol.count} | ${viol.threshold} |`;
      appended++;
    }
  }

  if (newRows !== '') {
    if (nextMatch) {
      const insertAt = logIdx + logHeader.length + nextMatch.index!;
      content = content.substring(0, insertAt) + newRows + content.substring(insertAt);
    } else {
      content = content.trimEnd() + newRows + '\n';
    }
    await ops.replaceFileContent(vault, topkPath, content);
  }

  await ops.updateFrontmatter(vault, topkPath, { updated: today }).catch(() => undefined);

  return { noteCount: noteEntries.length, appended, warning: '' };
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
  return runSync(vault, slug);
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'sync-topk',
  description: 'Append overflow log entries to _topk.<project>.md',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 1) {
      process.stderr.write('Usage: nerv sync-topk [--vault <name>] <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const slug = rest[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      logError(
        `sync-topk: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    try {
      const result = await runSync(vault, slug);
      if (result.warning && result.appended === 0 && result.warning.includes('not found')) {
        process.stderr.write(`ERROR: sync-topk: ${result.warning}\n`);
        process.exit(1);
      }
      process.stdout.write(
        `sync-topk: ${result.noteCount} note(s) scanned, ${result.appended} overflow row(s) appended to _topk.${slug}.md\n`
      );
      if (result.warning) {
        process.stdout.write(`WARN: ${result.warning}\n`);
      }
    } catch (err) {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  },
};

export default command;
