/**
 * create-project — TypeScript port of cli/core/create-project.sh.
 * Scaffolds 5 project files using typed templates.
 */

import { BaseCommand, type CommandContext } from './base-command';
import { rollbackLog } from '../lib/obsidian';
import { ontologyPath, projectDir, topkPath, vocabPath } from '../lib/project-paths';
import { getVaultOps } from '../ports/provider';
import {
  renderBase,
  renderOntology,
  renderRoot,
  renderTopk,
  renderVocab,
} from '../templates/index';
import { Slug } from '../types/slug';

export interface CreateProjectParams {
  vault: string;
  slug: string;
  title: string;
}

export interface CreateProjectResult {
  created: boolean;
  files: string[];
}

/**
 * Programmatic API for create-project — callable from other commands or tests.
 */
export async function createProject(
  params: CreateProjectParams
): Promise<{ ok: true; data: CreateProjectResult } | { ok: false; error: string }> {
  const { vault, slug, title } = params;

  if (!Slug.PATTERN.test(slug)) {
    return {
      ok: false,
      error: `create-project: slug must be lowercase alphanumeric with optional hyphens (got: ${slug})`,
    };
  }

  const ops = getVaultOps();
  const today = new Date().toISOString().slice(0, 10);
  const slugUpper = slug.toUpperCase();
  const projDirPath = projectDir(slug);
  const rootPath = `${projDirPath}/${slugUpper}.ROOT - ${title}.md`;
  const ontoPath = ontologyPath(slug);
  const vocPath = vocabPath(slug);
  const tkPath = topkPath(slug);
  const basePath = `${projDirPath}/${slug}.base`;

  /* Idempotency check */
  const existing = await ops.fileExists(vault, rootPath).catch(() => false);

  if (existing) {
    return { ok: true, data: { created: false, files: [] } };
  }

  /* Create ROOT — all subsequent failures record rollback state */
  await ops
    .createFile(
      vault,
      rootPath,
      renderRoot({
        title,
        kind: 'concept',
        spine: slug,
        status: 'draft',
        created: today,
        modified: today,
      })
    )
    .catch(async (e: unknown) => {
      await rollbackLog(
        vault,
        'create-project',
        `folder created: ${projDirPath}; ROOT creation failed`
      );
      throw e;
    });

  await ops
    .createFile(vault, ontoPath, renderOntology({ project: slug, updated: today }))
    .catch(async (e: unknown) => {
      await rollbackLog(
        vault,
        'create-project',
        `created ROOT; _ontology creation failed for ${slug}`
      );
      throw e;
    });

  await ops
    .createFile(vault, vocPath, renderVocab({ project: slug, updated: today }))
    .catch(async (e: unknown) => {
      await rollbackLog(
        vault,
        'create-project',
        `created ROOT _ontology; _vocab creation failed for ${slug}`
      );
      throw e;
    });

  await ops
    .createFile(vault, tkPath, renderTopk({ project: slug, updated: today }))
    .catch(async (e: unknown) => {
      await rollbackLog(
        vault,
        'create-project',
        `created ROOT _ontology _vocab; _topk creation failed for ${slug}`
      );
      throw e;
    });

  await ops.createFile(vault, basePath, renderBase({ slug })).catch(async (e: unknown) => {
    await rollbackLog(
      vault,
      'create-project',
      `created ROOT _ontology _vocab _topk; .base creation failed for ${slug}`
    );
    throw e;
  });

  return {
    ok: true,
    data: { created: true, files: [rootPath, ontoPath, vocPath, tkPath, basePath] },
  };
}

class CreateProjectCommand extends BaseCommand {
  readonly name = 'create-project';
  readonly description = 'Scaffold a new project (5 files) inside a vault';
  readonly usage = 'nerv create-project [--vault <name>] <slug> "<Title>"';
  readonly minPositional = 2;

  protected async execute(ctx: CommandContext): Promise<void> {
    const slug = ctx.positional[0];
    const title = ctx.positional[1];
    const result = await createProject({ vault: ctx.vault, slug, title });

    if (!result.ok) {
      return ctx.out.error(result.error);
    }

    if (!result.data.created) {
      ctx.out.info(`project "${slug}" already exists in vault ${ctx.vault} — no changes made`);
      return;
    }

    ctx.out.info(`project "${slug}" created in vault ${ctx.vault}`);
    for (const f of result.data.files) {
      ctx.out.info(`  ${f}`);
    }
  }
}

export default new CreateProjectCommand();
