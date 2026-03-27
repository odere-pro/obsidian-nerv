//
// TypeScript port of cli/core/create-entity.sh.
// Dual-export: default Command for the dispatcher + named createEntity() for
// programmatic callers (import-json, adr).

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { logError } from '../lib/logger';
import { dailyAppend, obEval, resolveVault, rollbackLog } from '../lib/obsidian';
import { renderBranch, renderLeaf, renderRoot } from '../templates/index';
import type { EntityType } from '../types/entity';
import type { CommandResult } from '../types/result';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const VALID_TYPES: EntityType[] = ['LEAF', 'BRANCH', 'ROOT'];

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

  if (!VALID_TYPES.includes(type)) {
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `create-entity: TYPE must be LEAF, BRANCH, or ROOT (got: ${type})`,
    };
  }

  if (!SLUG_RE.test(project)) {
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `create-entity: project slug must be lowercase alphanumeric with hyphens (got: ${project})`,
    };
  }

  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      data: { created: false, path: '', title },
      error: `create-entity: entity slug must be lowercase alphanumeric with hyphens (got: ${slug})`,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const projUpper = project.toUpperCase();
  const projDir = `projects/${project}`;
  const entityBasename = `${projUpper}.${slug} - ${title}`;
  const entityPath = `${projDir}/${entityBasename}.md`;

  // Idempotency check
  const existing = await obEval(
    vault,
    `app.vault.getAbstractFileByPath(${encodeForJs(entityPath)}) ? 'exists' : 'absent'`
  ).catch(() => 'absent');

  if (existing === 'exists') {
    return { ok: true, data: { created: false, path: entityPath, title } };
  }

  // Locate parent note and read its spine
  const jsParentPrefix = encodeForJs(`${projUpper}.${parentSlug} - `);
  const jsProjDir = encodeForJs(projDir);

  const parentInfoRaw = await obEval(
    vault,
    `(async () => {
  const projDir = ${jsProjDir};
  const prefix = ${jsParentPrefix};
  const f = app.vault.getFiles().find(function(f) {
    return f.path.startsWith(projDir + '/') && f.name.startsWith(prefix);
  });
  if (!f) return 'NOT_FOUND';
  const meta = app.metadataCache.getFileCache(f);
  const spine = (meta && meta.frontmatter && meta.frontmatter.spine)
    ? meta.frontmatter.spine : '';
  return JSON.stringify({basename: f.basename, spine: spine});
})()`
  ).catch(() => 'NOT_FOUND');

  if (parentInfoRaw === 'NOT_FOUND' || !parentInfoRaw) {
    const msg = `parent note '${projUpper}.${parentSlug} - *' not found in ${projDir}`;
    return { ok: false, data: { created: false, path: '', title }, error: msg };
  }

  const parentInfo = parseJson<{ basename: string; spine: string }>(parentInfoRaw);
  if (!parentInfo) {
    const msg = `could not parse parent info for '${parentSlug}'`;
    return { ok: false, data: { created: false, path: '', title }, error: msg };
  }

  const { basename: parentBasename, spine: parentSpine } = parentInfo;

  // Spine inheritance
  if (!spine && parentSpine) spine = parentSpine;
  if (!spine) spine = project;

  const parentLink = `[[${parentBasename}]]`;
  const entityLink = `[[${entityBasename}]]`;

  // Build note content using the typed template for this entity type
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
    // ROOT
    content = renderRoot({ title, kind, spine, status: 'draft', created: today, modified: today });
  }

  // Create the note file
  const createResult = await obEval(
    vault,
    `(async () => { await app.vault.create(${encodeForJs(entityPath)}, ${encodeForJs(content)}); return 'ok'; })()`
  ).catch(() => 'error');

  if (createResult !== 'ok') {
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

  // Update parent's children array via processFrontMatter
  const jsParentBasename = encodeForJs(parentBasename);
  const jsEntityLink = encodeForJs(entityLink);

  const updateResult = await obEval(
    vault,
    `(async () => {
  const parentFile = app.vault.getFiles().find(function(f) {
    return f.basename === ${jsParentBasename};
  });
  if (!parentFile) return 'NOT_FOUND';
  await app.fileManager.processFrontMatter(parentFile, function(fm) {
    if (!Array.isArray(fm.children)) fm.children = [];
    if (!fm.children.includes(${jsEntityLink})) fm.children.push(${jsEntityLink});
  });
  return 'ok';
})()`
  ).catch(() => 'error');

  if (updateResult !== 'ok') {
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

  // Log to daily note (best-effort)
  try {
    await dailyAppend(vault, `- Created ${entityLink}`);
  } catch {
    /* best-effort */
  }

  return { ok: true, data: { created: true, path: entityPath, title } };
}

const command: Command = {
  name: 'create-entity',
  description: 'Create a typed note inside a project',
  async run(args: string[]): Promise<void> {
    // Strip --json flag before positional assignment
    let jsonOutput = false;
    const positional = args.filter(a => {
      if (a === '--json') {
        jsonOutput = true;
        return false;
      }
      return true;
    });

    if (positional.length < 7) {
      process.stderr.write(
        'Usage: nerv create-entity <vault> <project> <TYPE> <slug> "<Title>" <parent_slug> <kind> [<spine>] [--json]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(positional[0]);
    const project = positional[1];
    const type = positional[2].toUpperCase() as EntityType;
    const slug = positional[3];
    const title = positional[4];
    const parentSlug = positional[5];
    const kind = positional[6];
    const spine = positional[7];

    if (!VALID_TYPES.includes(type)) {
      if (jsonOutput) {
        process.stdout.write(
          JSON.stringify({
            created: false,
            error: `TYPE must be LEAF, BRANCH, or ROOT (got: ${type})`,
          }) + '\n'
        );
      } else {
        logError(`create-entity: TYPE must be LEAF, BRANCH, or ROOT (got: ${type})`);
      }
    }

    const result = await createEntity({
      vault,
      project,
      type,
      slug,
      title,
      parentSlug,
      kind,
      spine,
    });

    if (jsonOutput) {
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
  },
};

export default command;
