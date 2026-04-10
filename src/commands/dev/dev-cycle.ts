/**
 * dev-cycle — Dev skill: run the full plugin development feedback cycle.
 *
 * Executes the 4-step feedback cycle:
 *   1. obsidian plugin:reload  — hot-reload the plugin
 *   2. obsidian dev:errors     — check for JS errors; stop if found
 *   3. obsidian dev:console    — show last 20 lines of console output
 *   4. obsidian dev:screenshot — capture viewport (only with --screenshot)
 *
 * <plugin-id> is the directory name under .obsidian/plugins/, NOT the display name.
 */

import { BaseCommand, type CommandContext } from '../base-command';
import { getDevOps } from '../../ports/provider';

const PLUGIN_ID_RE = /^[a-zA-Z0-9_-]+$/;

class DevCycleCommand extends BaseCommand {
  readonly name = 'dev/dev-cycle';
  readonly description =
    'Run the 4-step plugin development feedback cycle (reload \u2192 errors \u2192 console \u2192 screenshot)';
  readonly usage = 'nerv dev/dev-cycle [--vault <name>] <plugin-id> [--screenshot]';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    let screenshot = false;
    const positional: string[] = [];

    for (const a of ctx.positional) {
      if (a === '--screenshot') {
        screenshot = true;
      } else {
        positional.push(a);
      }
    }

    if (positional.length < 1) {
      ctx.out.error(`Usage: ${this.usage}`);
    }

    const pluginId = positional[0];

    if (!PLUGIN_ID_RE.test(pluginId)) {
      ctx.out.error(
        `dev-cycle: plugin-id must contain only letters, digits, hyphens, or underscores\n` +
          `       Pass the directory name from .obsidian/plugins/, not the display name.`
      );
    }

    const devOps = getDevOps();

    /* Step 1 — Reload */
    process.stdout.write(`[dev-cycle] Step 1/4: reloading plugin "${pluginId}"...\n`);
    await devOps.reloadPlugin(ctx.vault, pluginId);
    process.stdout.write(`[dev-cycle] Reload: OK\n`);

    /* Step 2 — Errors */
    process.stdout.write(`[dev-cycle] Step 2/4: checking for errors...\n`);
    const errorsOut = (await devOps.captureErrors(ctx.vault)).trim();

    if (errorsOut) {
      process.stdout.write(`[dev-cycle] ERRORS FOUND — stopping cycle:\n`);
      process.stdout.write(`${errorsOut}\n`);
      process.stdout.write(`\n[dev-cycle] Fix the errors above and re-run nerv dev/dev-cycle\n`);
      return;
    }
    process.stdout.write(`[dev-cycle] Errors: none\n`);

    /* Step 3 — Console (last 20 lines) */
    process.stdout.write(`[dev-cycle] Step 3/4: capturing console output...\n`);
    const consoleOut = (await devOps.captureConsole(ctx.vault)).trim();

    if (consoleOut) {
      const lines = consoleOut.split('\n').slice(-20);
      process.stdout.write(lines.join('\n') + '\n');
    } else {
      process.stdout.write(`[dev-cycle] Console: (no output)\n`);
    }

    /* Step 4 — Screenshot (only with --screenshot flag) */
    if (screenshot) {
      process.stdout.write(`[dev-cycle] Step 4/4: capturing screenshot...\n`);
      const screenshotOut = (await devOps.captureScreenshot(ctx.vault)).trim();
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
  }
}

export default new DevCycleCommand();
