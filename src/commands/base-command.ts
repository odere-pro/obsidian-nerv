/**
 * BaseCommand — Template Method pattern for CLI commands.
 *
 * Standardises the lifecycle that every command follows:
 *   1. Parse args (extract --vault, --json, positional args)
 *   2. Validate (min positional count, usage message)
 *   3. Resolve vault
 *   4. Execute (subclass logic)
 *   5. Output result
 *
 * Subclasses override `execute()` and optionally `validate()`.
 * The shared boilerplate that was duplicated in 25+ command files is
 * handled once here.
 */

import type { Command } from '../types/command';
import { resolveVault } from '../lib/obsidian';
import { selectOutput, type OutputStrategy } from '../lib/output';
import { getVaultOps } from '../ports/provider';
import type { VaultOps } from '../ports/vault-ops';
import { extractVaultFlag } from '../lib/vault-registry';

/* ---------------------------------------------------------------------------
 * Parsed context available to execute()
 * --------------------------------------------------------------------------- */

export interface CommandContext {
  /** Resolved vault name. */
  vault: string;
  /** Positional arguments (after --vault and --json are stripped). */
  positional: string[];
  /** Whether --json was specified. */
  jsonOutput: boolean;
  /** Output strategy selected by --json flag. */
  out: OutputStrategy;
  /** VaultOps port — injected for testability. */
  ops: VaultOps;
}

/* ---------------------------------------------------------------------------
 * Abstract base
 * --------------------------------------------------------------------------- */

export abstract class BaseCommand implements Command {
  abstract readonly name: string;
  abstract readonly description: string;

  /** Usage line shown on argument validation failure. */
  abstract readonly usage: string;

  /**
   * Minimum number of positional arguments required.
   * Set to 0 for commands that take no positional args.
   */
  abstract readonly minPositional: number;

  /**
   * Template Method — the standardised lifecycle.
   *
   * @param args  Raw CLI args (from the dispatcher, after subcommand is stripped)
   * @param ops   Optional VaultOps override for testing
   */
  async run(args: string[], ops?: VaultOps): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);
    let jsonOutput = false;

    const positional: string[] = [];
    for (const a of rest) {
      if (a === '--json') {
        jsonOutput = true;
      } else {
        positional.push(a);
      }
    }

    if (positional.length < this.minPositional) {
      process.stderr.write(`Usage: ${this.usage}\n`);
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const out = selectOutput(jsonOutput);
    const vaultOps = ops ?? getVaultOps();

    const ctx: CommandContext = { vault, positional, jsonOutput, out, ops: vaultOps };

    try {
      await this.execute(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.error(`${this.name}: ${msg}`);
    }
  }

  /**
   * Subclass-specific execution logic.
   * Receives a fully parsed and validated context.
   */
  protected abstract execute(ctx: CommandContext): Promise<void>;
}
