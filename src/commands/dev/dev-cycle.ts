// dev-cycle — Dev skill: run the full plugin development feedback cycle.
//
// Executes the 4-step feedback cycle:
//   1. obsidian plugin:reload  — hot-reload the plugin
//   2. obsidian dev:errors     — check for JS errors; stop if found
//   3. obsidian dev:console    — show last 20 lines of console output
//   4. obsidian dev:screenshot — capture viewport (only with --screenshot)
//
// <plugin-id> is the directory name under .obsidian/plugins/, NOT the display name.

import { spawnSync } from 'child_process';
import type { Command } from '../../cli';
import { resolveVault } from '../../lib/obsidian';
import { extractVaultFlag } from '../../lib/vault-registry';

const PLUGIN_ID_RE = /^[a-zA-Z0-9_-]+$/;

function obsidian(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('obsidian', args, { encoding: 'utf-8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

const command: Command = {
  name: 'dev/dev-cycle',
  description:
    'Run the 4-step plugin development feedback cycle (reload → errors → console → screenshot)',

  async run(args: string[]): Promise<void> {
    let screenshot = false;
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];
    for (const a of rest) {
      if (a === '--screenshot') {
        screenshot = true;
      } else {
        positional.push(a);
      }
    }

    if (positional.length < 1) {
      process.stderr.write(
        'Usage: nerv dev/dev-cycle [--vault <name>] <plugin-id> [--screenshot]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const pluginId = positional[0];

    if (!PLUGIN_ID_RE.test(pluginId)) {
      process.stderr.write(
        `ERROR: dev-cycle: plugin-id must contain only letters, digits, hyphens, or underscores\n` +
          `       Pass the directory name from .obsidian/plugins/, not the display name.\n`
      );
      process.exit(1);
    }

    // Step 1 — Reload
    process.stdout.write(`[dev-cycle] Step 1/4: reloading plugin "${pluginId}"...\n`);
    const reload = obsidian([`plugin:reload`, `vault=${vault}`, `plugin=${pluginId}`]);
    if (reload.status !== 0) {
      process.stderr.write(
        `ERROR: dev-cycle: plugin:reload failed for "${pluginId}"\n` +
          `       Verify the plugin ID matches the directory under .obsidian/plugins/\n`
      );
      if (reload.stderr) process.stderr.write(reload.stderr);
      process.exit(1);
    }
    process.stdout.write(`[dev-cycle] Reload: OK\n`);

    // Step 2 — Errors
    process.stdout.write(`[dev-cycle] Step 2/4: checking for errors...\n`);
    const errors = obsidian([`dev:errors`, `vault=${vault}`]);
    const errorsOut = errors.stdout.trim();

    if (errorsOut) {
      process.stdout.write(`[dev-cycle] ERRORS FOUND — stopping cycle:\n`);
      process.stdout.write(`${errorsOut}\n`);
      process.stdout.write(`\n[dev-cycle] Fix the errors above and re-run nerv dev/dev-cycle\n`);
      return;
    }
    process.stdout.write(`[dev-cycle] Errors: none\n`);

    // Step 3 — Console (last 20 lines)
    process.stdout.write(`[dev-cycle] Step 3/4: capturing console output...\n`);
    const consoleResult = obsidian([`dev:console`, `vault=${vault}`]);
    const consoleOut = consoleResult.stdout.trim();

    if (consoleOut) {
      const lines = consoleOut.split('\n').slice(-20);
      process.stdout.write(lines.join('\n') + '\n');
    } else {
      process.stdout.write(`[dev-cycle] Console: (no output)\n`);
    }

    // Step 4 — Screenshot (only with --screenshot flag)
    if (screenshot) {
      process.stdout.write(`[dev-cycle] Step 4/4: capturing screenshot...\n`);
      const screenshotResult = obsidian([`dev:screenshot`, `vault=${vault}`]);
      const screenshotOut = screenshotResult.stdout.trim();
      if (screenshotOut) {
        process.stdout.write(`[dev-cycle] Screenshot saved: ${screenshotOut}\n`);
      } else {
        process.stderr.write(`WARN: dev-cycle: dev:screenshot returned no output\n`);
      }
    } else {
      process.stdout.write(
        `[dev-cycle] Step 4/4: screenshot skipped (pass --screenshot to capture)\n`
      );
    }

    process.stdout.write(`\n[dev-cycle] Cycle complete for plugin "${pluginId}"\n`);
  },
};

export default command;
