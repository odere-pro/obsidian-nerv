/**
 * import-json — TypeScript port of cli/core/import-json.sh.
 * Reads a JSON array via Bun.file — zero Python dependency.
 * Calls createEntity() directly (no subprocess) for each entry.
 */

import { projectDir } from '../lib/project-paths';
import { getVaultOps } from '../ports/provider';
import { EntityTypes } from '../types/entity';
import type { EntityType } from '../types/entity';
import { Slug } from '../types/slug';
import { createEntity } from './create-entity';
import { BaseCommand, type CommandContext } from './base-command';
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

    let type: EntityType;
    try {
      type = EntityTypes.parse(entry.type ?? 'LEAF');
    } catch {
      process.stderr.write(`WARN: skipping entry "${entry.name}" — invalid type: ${entry.type}\n`);
      skipped++;
      continue;
    }
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
      spine,
    });

    if (!result.ok) {
      /* Non-fatal: report and skip */
      process.stderr.write(`WARN: failed to create "${entry.name}": ${result.error}\n`);
      skipped++;
      continue;
    }

    if (!result.data.created) {
      skipped++;
      continue;
    }

    /* Apply extra frontmatter fields (everything beyond standard schema) */
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

class ImportJsonCommand extends BaseCommand {
  readonly name = 'import-json';
  readonly description = 'Bulk-create notes from a JSON array file';
  readonly usage = 'nerv import-json [--vault <name>] <project_slug> <json_file>';
  readonly minPositional = 2;

  protected async execute(ctx: CommandContext): Promise<void> {
    const projectSlug = ctx.positional[0];
    const jsonFile = ctx.positional[1];

    if (!Slug.PATTERN.test(projectSlug)) {
      return ctx.out.error(
        `import-json: project slug must be lowercase alphanumeric with optional hyphens (got: ${projectSlug})`
      );
    }

    /* Read JSON using Bun.file — zero Python dependency */
    let entries: ImportEntry[];
    try {
      const raw = (await Bun.file(jsonFile).json()) as unknown;
      if (!Array.isArray(raw)) {
        return ctx.out.error('import-json: JSON root must be an array');
      }
      entries = raw as ImportEntry[];
    } catch {
      return ctx.out.error(`import-json: failed to read or parse JSON file: ${jsonFile}`);
    }

    /* Verify the project exists */
    const projDirPath = projectDir(projectSlug);
    const projExists = await ctx.ops.fileExists(ctx.vault, projDirPath).catch(() => false);

    if (!projExists) {
      return ctx.out.error(
        `import-json: project '${projectSlug}' not found in vault ${ctx.vault}. Run create-project first.`
      );
    }

    const { created, skipped } = await importJson({ vault: ctx.vault, projectSlug, entries });

    ctx.out.success(`Created: ${created}, Skipped: ${skipped}`);
  }
}

export default new ImportJsonCommand();
