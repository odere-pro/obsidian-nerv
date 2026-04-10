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

import type { Command } from '../cli';
import { parseJson } from '../lib/json';
import { obEval, resolveVault, rollbackLog } from '../lib/obsidian';
import { extractVaultFlag } from '../lib/vault-registry';
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

const command: Command = {
  name: 'migrate',
  description:
    'Apply bulk schema changes from a declarative JSON spec (rename-rel, rename-spine, add-field, promote)',

  async run(args: string[]): Promise<void> {
    let dryRun = false;
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];
    for (const a of rest) {
      if (a === '--dry-run') dryRun = true;
      else positional.push(a);
    }

    if (positional.length < 2) {
      process.stderr.write(
        'Usage: nerv migrate [--vault <name>] <project_slug> <spec_file> [--dry-run]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const slug = positional[0];
    const specPath = positional[1];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      process.stderr.write(
        `ERROR: migrate: project slug must be lowercase alphanumeric with hyphens (got: ${slug})\n`
      );
      process.exit(1);
    }

    /* Read and parse spec */
    let spec: MigrateOp[];
    try {
      spec = await Bun.file(specPath).json();
    } catch {
      process.stderr.write(`ERROR: migrate: spec file not found or invalid JSON: ${specPath}\n`);
      process.exit(1);
    }

    /* Structural validation */
    const validationErrors = validateSpec(spec);
    if (validationErrors.length > 0) {
      for (const err of validationErrors) {
        process.stderr.write(`ERROR: migrate: ${err}\n`);
      }
      process.exit(1);
    }

    /* Run migration via Obsidian eval */
    const raw = await obEval(vault, buildMigrateExpr(spec, slug, dryRun)).catch((e: unknown) => {
      process.stderr.write(
        `ERROR: migrate: Obsidian not reachable or eval failed: ${e instanceof Error ? e.message : String(e)}\n`
      );
      process.exit(1);
    });
    if (!raw) {
      process.stderr.write('ERROR: migrate: Obsidian returned empty result\n');
      process.exit(1);
    }

    const data = parseJson<MigrateResult>(raw);
    if (!data) {
      process.stderr.write('ERROR: migrate: invalid JSON from eval\n');
      process.stderr.write('DEBUG raw: ' + JSON.stringify(raw) + '\n');
      process.exit(1);
    }

    if (data.validationFailed) {
      for (const err of data.errors ?? []) {
        process.stderr.write(`ERROR: migrate: ${err}\n`);
      }
      process.exit(1);
    }

    /* Print per-operation results */
    for (const op of data.ops) {
      if (op.error) {
        process.stderr.write(`ERROR: migrate: ${op.op} — ${op.error}\n`);
        process.exit(1);
      }
      if (dryRun) {
        process.stdout.write(`Dry-run ${op.op}: ${op.count} note(s) would be modified\n`);
        if (op.notes.length > 0) {
          for (const n of op.notes) process.stdout.write(`  ${n}\n`);
        }
      } else {
        process.stdout.write(`Applied ${op.op} to ${op.count} note(s)\n`);
      }
    }

    const total = data.totalModified;
    if (dryRun) {
      process.stdout.write(`Dry-run complete: ${total} total note(s) would be modified\n`);
    } else {
      process.stdout.write(`Migration complete: ${total} total note(s) modified\n`);

      /* Write rollback log if any changes were made */
      if (total > 0) {
        const summary = `migrate ${slug}: ` + data.ops.map(r => `${r.op} ${r.count}`).join('; ');
        await rollbackLog(vault, `migrate ${slug}`, summary).catch(() => undefined);
      }
    }
  },
};

export default command;
