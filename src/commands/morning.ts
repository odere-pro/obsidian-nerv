// morning — Orchestration skill: daily startup sequence.
//
// Executes 4 steps in sequence using spawnCapture for all Obsidian CLI calls:
//   1. obsidian daily          — open today's daily note
//   2. obsidian daily:append   — append inbox backlog count
//   3. obsidian files           — list 10 most recently modified files
//   4. obsidian unresolved     — list unresolved wikilinks
//
// Install cron entry for weekday 08:00:
//   0 8 * * 1-5 ~/.ontology-cli/bin/nerv morning [--vault <name>]

import type { Command } from '../cli';
import { resolveVault } from '../lib/obsidian';
import { spawnCapture } from '../lib/shell';
import { extractVaultFlag } from '../lib/vault-registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cron expression for weekday 08:00 morning startup. */
export const CRON_ENTRY = '0 8 * * 1-5 ~/.ontology-cli/bin/nerv morning [--vault <name>]';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MorningDeps {
  spawnCapture: typeof spawnCapture;
}

export interface MorningResult {
  inboxCount: number;
  recentFiles: string[];
  unresolvedCount: number;
}

// ---------------------------------------------------------------------------
// Core — injectable deps for unit testing
// ---------------------------------------------------------------------------

export async function runMorning(vault: string, deps: MorningDeps): Promise<MorningResult> {
  // Step 1: open today's daily note
  await deps.spawnCapture(['obsidian', 'daily', `vault=${vault}`]).catch(() => undefined);
  process.stdout.write('[morning] daily note opened\n');

  // Step 2: count inbox backlog and append to daily note
  let inboxCount = 0;
  try {
    const { stdout, exitCode } = await deps.spawnCapture([
      'obsidian',
      'eval',
      `vault=${vault}`,
      "code=app.vault.getMarkdownFiles().filter(f => f.path.startsWith('_inbox/')).length",
    ]);
    if (exitCode === 0) {
      inboxCount = parseInt(stdout.replace(/^=> /gm, '').trim(), 10) || 0;
    }
  } catch {
    /* fallback to 0 */
  }

  await deps
    .spawnCapture([
      'obsidian',
      'daily:append',
      `vault=${vault}`,
      `content=- Inbox backlog: ${inboxCount} note(s)`,
    ])
    .catch(() => undefined);
  process.stdout.write(`[morning] inbox backlog: ${inboxCount} note(s)\n`);

  // Step 3: recently modified files (last 10)
  let recentFiles: string[] = [];
  try {
    const { stdout, exitCode } = await deps.spawnCapture([
      'obsidian',
      'files',
      `vault=${vault}`,
      'sort=modified',
      'limit=10',
      '--copy',
    ]);
    if (exitCode === 0 && stdout.trim()) {
      recentFiles = stdout.trim().split('\n').filter(Boolean);
      process.stdout.write(`[morning] recently modified files:\n${stdout.trim()}\n`);
    }
  } catch {
    /* graceful skip */
  }

  // Step 4: unresolved wikilinks
  let unresolvedCount = 0;
  try {
    const { stdout, exitCode } = await deps.spawnCapture([
      'obsidian',
      'unresolved',
      `vault=${vault}`,
    ]);
    if (exitCode === 0) {
      const lines = stdout.trim().split('\n').filter(Boolean);
      unresolvedCount = lines.length;
      if (unresolvedCount > 0) {
        process.stdout.write(`[morning] unresolved wikilinks:\n${stdout.trim()}\n`);
      } else {
        process.stdout.write('[morning] no unresolved wikilinks\n');
      }
    }
  } catch {
    /* graceful skip */
  }

  return { inboxCount, recentFiles, unresolvedCount };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'morning',
  description:
    'Daily startup sequence: open daily note, inbox count, recent files, unresolved links',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg } = extractVaultFlag(args);
    const vault = await resolveVault(vaultArg);
    await runMorning(vault, { spawnCapture });
  },
};

export default command;
