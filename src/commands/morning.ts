/**
 * morning — Orchestration skill: daily startup sequence.
 *
 * Executes 4 steps in sequence using VaultOps port for all vault operations:
 *   1. openDaily           — open today's daily note
 *   2. listFiles + count   — count inbox backlog, append to daily
 *   3. listRecentFiles     — list 10 most recently modified files
 *   4. listUnresolved      — list unresolved wikilinks
 *
 * Install cron entry for weekday 08:00:
 *   0 8 * * 1-5 ~/.ontology-cli/bin/nerv morning [--vault <name>]
 */

import type { Command } from '../cli';
import { resolveVault } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import type { VaultOps } from '../ports/vault-ops';
import { extractVaultFlag } from '../lib/vault-registry';

/* ---------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------- */

/** Cron expression for weekday 08:00 morning startup. */
export const CRON_ENTRY = '0 8 * * 1-5 ~/.ontology-cli/bin/nerv morning [--vault <name>]';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface MorningResult {
  inboxCount: number;
  recentFiles: string[];
  unresolvedCount: number;
}

/* ---------------------------------------------------------------------------
 * Core — accepts VaultOps for unit testing
 * --------------------------------------------------------------------------- */

export async function runMorning(vault: string, ops: VaultOps): Promise<MorningResult> {
  /* Step 1: open today's daily note */
  await ops.openDaily(vault).catch(() => undefined);
  process.stdout.write('[morning] daily note opened\n');

  /* Step 2: count inbox backlog and append to daily note */
  let inboxCount = 0;
  try {
    const entries = await ops.listFiles(vault);
    inboxCount = entries.filter(f => f.path.startsWith('_inbox/')).length;
  } catch {
    /* fallback to 0 */
  }

  await ops.appendToDaily(vault, `- Inbox backlog: ${inboxCount} note(s)`).catch(() => undefined);
  process.stdout.write(`[morning] inbox backlog: ${inboxCount} note(s)\n`);

  /* Step 3: recently modified files (last 10) */
  let recentFiles: string[] = [];
  try {
    recentFiles = await ops.listRecentFiles(vault, 10, 'modified');
    if (recentFiles.length > 0) {
      process.stdout.write(`[morning] recently modified files:\n${recentFiles.join('\n')}\n`);
    }
  } catch {
    /* graceful skip */
  }

  /* Step 4: unresolved wikilinks */
  let unresolvedCount = 0;
  try {
    const unresolved = await ops.listUnresolved(vault);
    unresolvedCount = unresolved.length;
    if (unresolvedCount > 0) {
      process.stdout.write(`[morning] unresolved wikilinks:\n${unresolved.join('\n')}\n`);
    } else {
      process.stdout.write('[morning] no unresolved wikilinks\n');
    }
  } catch {
    /* graceful skip */
  }

  return { inboxCount, recentFiles, unresolvedCount };
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

const command: Command = {
  name: 'morning',
  description:
    'Daily startup sequence: open daily note, inbox count, recent files, unresolved links',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg } = extractVaultFlag(args);
    const vault = await resolveVault(vaultArg);
    await runMorning(vault, getVaultOps());
  },
};

export default command;
