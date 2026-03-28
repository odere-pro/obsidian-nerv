//
// TypeScript port of cli/core/import-json.sh.
// Reads a JSON array via Bun.file — zero Python dependency.
// Calls createEntity() directly (no subprocess) for each entry.

import type { Command } from '../cli';
import { logError } from '../lib/logger';
import { resolveVault } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import type { EntityType } from '../types/entity';
import { createEntity } from './create-entity';
import { extractVaultFlag } from '../lib/vault-registry';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const STANDARD_FIELDS = new Set(['name', 'type', 'kind', 'spine', 'parent']);

interface ImportEntry {
  name: string;
  type?: string;
  kind?: string;
  spine?: string;
  parent?: string;
  [key: string]: unknown;
}

/**
 * Derive a note slug from a title: lowercase, alphanumeric only.
 * e.g. "TestImport" → "testimport", "My Note" → "mynote"
 */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Programmatic API for import-json.
 *
 * @returns counts of created and skipped notes
 */
export async function importJson(params: {
  vault: string;
  projectSlug: string;
  entries: ImportEntry[];
}): Promise<{ created: number; skipped: number }> {
  const { vault, projectSlug, entries } = params;
  const ops = getVaultOps();

  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.name) {
      process.stderr.write('WARN: skipping entry with missing name field\n');
      skipped++;
      continue;
    }

    const noteSlug = slugify(entry.name);
    if (!noteSlug) {
      process.stderr.write(
        `WARN: skipping entry "${entry.name}" — slug is empty after sanitisation\n`
      );
      skipped++;
      continue;
    }

    const type = (entry.type ?? 'LEAF').toUpperCase() as EntityType;
    const kind = entry.kind ?? 'concept';
    const spine = entry.spine ?? '';
    const parentSlug = entry.parent ?? 'ROOT';

    const result = await createEntity({
      vault,
      project: projectSlug,
      type,
      slug: noteSlug,
      title: entry.name,
      parentSlug,
      kind,
      spine: spine || undefined,
    });

    if (!result.ok) {
      // Non-fatal: report and skip
      process.stderr.write(`WARN: failed to create "${entry.name}": ${result.error}\n`);
      skipped++;
      continue;
    }

    if (!result.data.created) {
      skipped++;
      continue;
    }

    // Apply extra frontmatter fields (everything beyond standard schema)
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (!STANDARD_FIELDS.has(k)) extras[k] = v;
    }

    if (Object.keys(extras).length > 0) {
      const notePath = result.data.path;
      try {
        await ops.updateFrontmatter(vault, notePath, extras);
      } catch {
        /* best-effort */
      }
    }

    created++;
  }

  return { created, skipped };
}

const command: Command = {
  name: 'import-json',
  description: 'Bulk-create notes from a JSON array file',
  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 2) {
      process.stderr.write('Usage: nerv import-json [--vault <name>] <project_slug> <json_file>\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const projectSlug = rest[0];
    const jsonFile = rest[1];

    if (!SLUG_RE.test(projectSlug)) {
      logError(
        `import-json: project slug must be lowercase alphanumeric with optional hyphens (got: ${projectSlug})`
      );
    }

    // Read JSON using Bun.file — zero Python dependency
    let entries: ImportEntry[];
    try {
      const raw = (await Bun.file(jsonFile).json()) as unknown;
      if (!Array.isArray(raw)) {
        process.stderr.write('ERROR: import-json: JSON root must be an array\n');
        process.exit(1);
      }
      entries = raw as ImportEntry[];
    } catch {
      process.stderr.write(`ERROR: import-json: failed to read or parse JSON file: ${jsonFile}\n`);
      process.exit(1);
    }

    // Verify the project exists
    const ops = getVaultOps();
    const projDir = `projects/${projectSlug}`;
    const projExists = await ops.fileExists(vault, projDir).catch(() => false);

    if (!projExists) {
      logError(
        `import-json: project '${projectSlug}' not found in vault ${vault}. Run create-project first.`
      );
    }

    const { created, skipped } = await importJson({ vault, projectSlug, entries });

    process.stdout.write(`Created: ${created}, Skipped: ${skipped}\n`);
  },
};

export default command;
