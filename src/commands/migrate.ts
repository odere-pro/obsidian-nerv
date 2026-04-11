/**
 * migrate — Schema migration skill: apply bulk schema changes from a declarative spec.
 *
 * Spec format (JSON array of operations):
 *   [
 *     {"op":"rename-rel",   "from":"triggers",  "to":"activates"},
 *     {"op":"rename-spine", "from":"aws",        "to":"cloud"},
 *     {"op":"add-field",    "field":"reviewed",  "value":false, "filter":{"type":"LEAF"}},
 *     {"op":"promote",      "note":"PREFIX.leaf-slug"}
 *   ]
 *
 * Flags:
 *   --dry-run   Report changes without modifying any files
 *
 * Pre-flight validation runs before any modification (identical logic for dry-run and apply).
 * Idempotent: re-running an applied migration exits 0 with 0 notes modified per operation.
 * promote uses fileManager.renameFile for automatic wikilink updates.
 * Path traversal protection: asserts new path starts with projects/<slug>/ before rename.
 *
 * Post-apply: appends migration summary to daily note; writes rollback log entry.
 */

import { logWarn } from '../lib/logger';
import { BaseCommand, type CommandContext } from './base-command';
import { parseJson } from '../lib/json';
import { obEval, rollbackLog } from '../lib/obsidian';
import { Slug } from '../types/slug';
import { buildMigrateExpr } from './migrate-engine';
import type { MigrateOp, MigrateResult } from './migrate-spec';
import { validateSpec } from './migrate-spec';

/* ---------------------------------------------------------------------------
 * Re-exports for backward compatibility
 * --------------------------------------------------------------------------- */
export type { MigrateOp, MigrateResult, OpResult } from './migrate-spec';
export { validateSpec } from './migrate-spec';

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

class MigrateCommand extends BaseCommand {
  readonly name = 'migrate';
  readonly description =
    'Apply bulk schema changes from a declarative JSON spec (rename-rel, rename-spine, add-field, promote)';
  readonly usage = 'nerv migrate [--vault <name>] <project_slug> <spec_file> [--dry-run]';
  readonly minPositional = 2;

  protected async execute(ctx: CommandContext): Promise<void> {
    /* Extract --dry-run from positional args (not handled by BaseCommand) */
    let dryRun = false;
    const positional: string[] = [];
    for (const a of ctx.positional) {
      if (a === '--dry-run') dryRun = true;
      else positional.push(a);
    }

    if (positional.length < 2) {
      return ctx.out.error(`Usage: ${this.usage}`);
    }

    const slug = positional[0];
    const specPath = positional[1];

    if (!Slug.PATTERN.test(slug)) {
      return ctx.out.error(
        `migrate: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    /* Read and parse spec */
    let spec: MigrateOp[];
    try {
      spec = await Bun.file(specPath).json();
    } catch {
      return ctx.out.error(`migrate: spec file not found or invalid JSON: ${specPath}`);
    }

    /* Structural validation */
    const validationErrors = validateSpec(spec);
    if (validationErrors.length > 0) {
      return ctx.out.error(validationErrors.map(e => `migrate: ${e}`).join('\n'));
    }

    /* Run migration via Obsidian eval */
    const raw = await obEval(ctx.vault, buildMigrateExpr(spec, slug, dryRun)).catch(
      (e: unknown) => {
        return ctx.out.error(
          `migrate: Obsidian not reachable or eval failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    );
    if (!raw) {
      return ctx.out.error('migrate: Obsidian returned empty result');
    }

    const data = parseJson<MigrateResult>(raw);
    if (!data) {
      return ctx.out.error('migrate: invalid JSON from eval\nDEBUG raw: ' + JSON.stringify(raw));
    }

    if (data.validationFailed) {
      return ctx.out.error((data.errors ?? []).map(e => `migrate: ${e}`).join('\n'));
    }

    /* Print per-operation results */
    for (const op of data.ops) {
      if (op.error) {
        return ctx.out.error(`migrate: ${op.op} — ${op.error}`);
      }
      if (dryRun) {
        ctx.out.info(`Dry-run ${op.op}: ${op.count} note(s) would be modified`);
        for (const n of op.notes) ctx.out.info(`  ${n}`);
      } else {
        ctx.out.info(`Applied ${op.op} to ${op.count} note(s)`);
      }
    }

    const total = data.totalModified;
    if (dryRun) {
      ctx.out.success(`Dry-run complete: ${total} total note(s) would be modified`);
    } else {
      ctx.out.success(`Migration complete: ${total} total note(s) modified`);

      /* Write rollback log if any changes were made */
      if (total > 0) {
        const summary = `migrate ${slug}: ` + data.ops.map(r => `${r.op} ${r.count}`).join('; ');
        await rollbackLog(ctx.vault, `migrate ${slug}`, summary).catch(() => {
          logWarn('migrate: failed to write rollback log');
        });
      }
    }
  }
}

export default new MigrateCommand();
