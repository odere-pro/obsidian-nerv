/**
 * TypeScript port of cli/core/create-entity.sh.
 *
 * Dual-export: default Command for the dispatcher + named createEntity() for
 * programmatic callers (import-json, adr).
 */

import { logError } from '../lib/logger';
import { rollbackLog } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import { renderBranch, renderLeaf, renderRoot } from '../templates/index';
import { EntityTypes } from '../types/entity';
import type { EntityType } from '../types/entity';
import type { CommandResult } from '../types/result';
import { Slug } from '../types/slug';
import { BaseCommand, type CommandContext } from './base-command';

export interface CreateEntityParams {
  vault: string;
  project: string;
  type: EntityType;
  slug: string;
  title: string;
  parentSlug: string;
  kind: string;
  spine?: string;
}

export interface CreateEntityData {
  created: boolean;
  path: string;
  title: string;
}

/**
 * Resolve the vault-relative path for a note given its project, type, slug, and title.
 * Pure function — no I/O; unit-testable without mocks.
 */
export function resolveNotePath(project: string, slug: string, title: string): string {
  const projUpper = project.toUpperCase();
  return `projects/${project}/${projUpper}.${slug} - ${title}.md`;
}

/**
 * Programmatic API for create-entity — callable from import-json, adr, etc.
 */
export async function createEntity(
  params: CreateEntityParams
): Promise<CommandResult<CreateEntityData>> {
  const { vault, project, type, slug, title, parentSlug, kind } = params;
  let { spine } = params;

  if (!EntityTypes.ALL.includes(type)) {
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `create-entity: TYPE must be LEAF, BRANCH, or ROOT (got: ${type})`,
    };
  }

  if (!Slug.PATTERN.test(project)) {
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `create-entity: project slug must be lowercase alphanumeric with hyphens (got: ${project})`,
    };
  }

  if (!Slug.PATTERN.test(slug)) {
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `create-entity: entity slug must be lowercase alphanumeric with hyphens (got: ${slug})`,
    };
  }

  const ops = getVaultOps();
  const today = new Date().toISOString().slice(0, 10);
  const projUpper = project.toUpperCase();
  const projDir = `projects/${project}`;
  const entityBasename = `${projUpper}.${slug} - ${title}`;
  const entityPath = `${projDir}/${entityBasename}.md`;

  /* Idempotency check */
  const exists = await ops.fileExists(vault, entityPath).catch(() => false);

  if (exists) {
    return { ok: true, data: { created: false, path: entityPath, title } };
  }

  /* Locate parent note and read its spine via listFiles */
  const parentPrefix = `${projUpper}.${parentSlug} - `;
  const allFiles = await ops.listFiles(vault).catch(() => []);
  const parentEntry = allFiles.find(f => {
    const fileName = f.path.split('/').pop() ?? '';
    return f.path.startsWith(projDir + '/') && fileName.startsWith(parentPrefix);
  });

  if (!parentEntry) {
    const msg = `parent note '${projUpper}.${parentSlug} - *' not found in ${projDir}`;
    return { ok: false, data: { created: false, path: '', title }, error: msg };
  }

  const parentBasename = parentEntry.path.split('/').pop()!.replace(/\.md$/, '');
  const parentSpine = (parentEntry.frontmatter.spine as string) ?? '';

  /* Spine inheritance */
  if (!spine && parentSpine) spine = parentSpine;
  if (!spine) spine = project;

  const parentLink = `[[${parentBasename}]]`;
  const entityLink = `[[${entityBasename}]]`;

  /* Build note content using the typed template for this entity type */
  const sharedParams = {
    title,
    slug,
    project,
    kind,
    spine,
    status: 'draft' as const,
    created: today,
    modified: today,
  };
  let content: string;
  if (type === 'LEAF') {
    content = renderLeaf({ ...sharedParams, parent: parentLink });
  } else if (type === 'BRANCH') {
    content = renderBranch({ ...sharedParams, parent: parentLink });
  } else {
    /* ROOT */
    content = renderRoot({ title, kind, spine, status: 'draft', created: today, modified: today });
  }

  /* Create the note file */
  try {
    await ops.createFile(vault, entityPath, content);
  } catch {
    try {
      await rollbackLog(vault, 'create-entity', `file creation failed: ${entityPath}`);
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `file creation failed for ${entityPath}`,
    };
  }

  /* Update parent's children array via updateFrontmatter */
  try {
    const currentChildren = (parentEntry.frontmatter.children ?? []) as string[];
    if (!currentChildren.includes(entityLink)) {
      await ops.updateFrontmatter(vault, parentEntry.path, {
        children: [...currentChildren, entityLink],
      });
    }
  } catch {
    try {
      await rollbackLog(
        vault,
        'create-entity',
        `entity created at ${entityPath} but parent children update failed (parent: ${parentBasename})`
      );
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `parent children update failed; entity was created at ${entityPath}`,
    };
  }

  /* Log to daily note (best-effort) */
  try {
    await ops.appendToDaily(vault, `- Created ${entityLink}`);
  } catch {
    /* best-effort */
  }

  return { ok: true, data: { created: true, path: entityPath, title } };
}

class CreateEntityCommand extends BaseCommand {
  readonly name = 'create-entity';
  readonly description = 'Create a typed note inside a project';
  readonly usage =
    'nerv create-entity [--vault <name>] <project> <TYPE> <slug> "<Title>" <parent_slug> <kind> [<spine>] [--json]';
  readonly minPositional = 7;

  protected async execute(ctx: CommandContext): Promise<void> {
    const project = ctx.positional[0];
    const slug = ctx.positional[2];
    const title = ctx.positional[3];
    const parentSlug = ctx.positional[4];
    const kind = ctx.positional[5];
    const spine = ctx.positional[6];

    let type: EntityType;
    try {
      type = EntityTypes.parse(ctx.positional[1]);
    } catch {
      const msg = `TYPE must be LEAF, BRANCH, or ROOT (got: ${ctx.positional[1]})`;
      if (ctx.jsonOutput) {
        process.stdout.write(JSON.stringify({ created: false, error: msg }) + '\n');
      } else {
        logError(`create-entity: ${msg}`);
      }
      return;
    }

    const result = await createEntity({
      vault: ctx.vault,
      project,
      type,
      slug,
      title,
      parentSlug,
      kind,
      spine,
    });

    if (ctx.jsonOutput) {
      if (result.ok) {
        process.stdout.write(
          JSON.stringify({
            created: result.data.created,
            path: result.data.path,
            title: result.data.title,
          }) + '\n'
        );
      } else {
        process.stdout.write(JSON.stringify({ created: false, error: result.error }) + '\n');
      }
      if (!result.ok) process.exit(1);
    } else {
      if (!result.ok) {
        process.stderr.write(`ERROR: ${result.error}\n`);
        process.exit(1);
      }
      if (result.data.created) {
        process.stdout.write(`INFO: created ${result.data.path}\n`);
      } else {
        process.stdout.write(`INFO: entity "${slug}" already exists — no changes made\n`);
      }
    }
  }
}

export default new CreateEntityCommand();
