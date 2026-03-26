// STORY-033 — Motor skills migration: create-project command
//
// TypeScript port of cli/core/create-project.sh.
// Scaffolds 5 project files using typed templates from STORY-032.

import type { Command } from '../cli.ts';
import { resolveVault, obEval, rollbackLog } from '../lib/obsidian.ts';
import { encodeForJs } from '../lib/json.ts';
import { logError } from '../lib/logger.ts';
import {
  renderRoot,
  renderOntology,
  renderVocab,
  renderTopk,
  renderBase,
} from '../templates/index.ts';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface CreateProjectParams {
  vault: string;
  slug: string;
  title: string;
}

/**
 * Programmatic API for create-project — callable from other commands or tests.
 */
export async function createProject(params: CreateProjectParams): Promise<void> {
  const { vault, slug, title } = params;

  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `create-project: slug must be lowercase alphanumeric with optional hyphens (got: ${slug})`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const slugUpper = slug.toUpperCase();
  const projDir = `projects/${slug}`;
  const rootPath = `${projDir}/${slugUpper}.ROOT - ${title}.md`;
  const ontoPath = `${projDir}/_ontology.${slug}.md`;
  const vocabPath = `${projDir}/_vocab.${slug}.md`;
  const topkPath = `${projDir}/_topk.${slug}.md`;
  const basePath = `${projDir}/${slug}.base`;

  // Idempotency check
  const existing = await obEval(
    vault,
    `app.vault.getAbstractFileByPath(${encodeForJs(rootPath)}) ? 'exists' : 'absent'`
  ).catch(() => 'absent');

  if (existing === 'exists') {
    process.stdout.write(
      `INFO: project "${slug}" already exists in vault ${vault} — no changes made\n`
    );
    return;
  }

  // Ensure the project folder exists
  const jsProjDir = encodeForJs(projDir);
  await obEval(
    vault,
    `(async () => {
  const exists = app.vault.getAbstractFileByPath(${jsProjDir});
  if (!exists) await app.vault.createFolder(${jsProjDir});
})()`
  );

  async function createFile(path: string, content: string): Promise<void> {
    await obEval(
      vault,
      `(async () => { await app.vault.create(${encodeForJs(path)}, ${encodeForJs(content)}); })()`
    );
  }

  // Create ROOT — all subsequent failures record rollback state
  await createFile(
    rootPath,
    renderRoot({
      title,
      kind: 'concept',
      spine: slug,
      status: 'draft',
      created: today,
      modified: today,
    })
  ).catch(async (e: unknown) => {
    await rollbackLog(vault, 'create-project', `folder created: ${projDir}; ROOT creation failed`);
    throw e;
  });

  await createFile(ontoPath, renderOntology({ project: slug, updated: today })).catch(
    async (e: unknown) => {
      await rollbackLog(
        vault,
        'create-project',
        `created ROOT; _ontology creation failed for ${slug}`
      );
      throw e;
    }
  );

  await createFile(vocabPath, renderVocab({ project: slug, updated: today })).catch(
    async (e: unknown) => {
      await rollbackLog(
        vault,
        'create-project',
        `created ROOT _ontology; _vocab creation failed for ${slug}`
      );
      throw e;
    }
  );

  await createFile(topkPath, renderTopk({ project: slug, updated: today })).catch(
    async (e: unknown) => {
      await rollbackLog(
        vault,
        'create-project',
        `created ROOT _ontology _vocab; _topk creation failed for ${slug}`
      );
      throw e;
    }
  );

  await createFile(basePath, renderBase({ slug })).catch(async (e: unknown) => {
    await rollbackLog(
      vault,
      'create-project',
      `created ROOT _ontology _vocab _topk; .base creation failed for ${slug}`
    );
    throw e;
  });

  process.stdout.write(`INFO: project "${slug}" created in vault ${vault}\n`);
  process.stdout.write(
    `  ${rootPath}\n  ${ontoPath}\n  ${vocabPath}\n  ${topkPath}\n  ${basePath}\n`
  );
}

const command: Command = {
  name: 'create-project',
  description: 'Scaffold a new project (5 files) inside a vault',
  async run(args: string[]): Promise<void> {
    if (args.length < 3) {
      process.stderr.write('Usage: nerv create-project <vault|vault=name> <slug> "<Title>"\n');
      process.exit(1);
    }
    const vault = await resolveVault(args[0]);
    const slug = args[1];
    const title = args[2];
    await createProject({ vault, slug, title }).catch((e: unknown) => {
      logError(e instanceof Error ? e.message : String(e));
    });
  },
};

export default command;
