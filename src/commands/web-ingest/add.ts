/**
 * web-ingest/add — Fetches a URL via `defuddle parse`, creates a LEAF note with
 * kind: web-source, patches frontmatter with url/source_title/source_date, and
 * writes extracted content into the note body.
 *
 * Programmatic API:  ingestUrl(url, vault, project, parent?)
 * CLI:               nerv web-ingest/add [--vault <name>] <project> <url> [<parent_slug>] [--json]
 */

import { logWarn } from '../../lib/logger';
import { fetchAndParse, generateUrlSlug } from '../../lib/defuddle';
import { getVaultOps } from '../../ports/provider';
import type { VaultOps } from '../../ports/vault-ops';
import type { CommandResult } from '../../types/result';
import { Slug } from '../../types/slug';
import { createEntity } from '../create-entity';
import { BaseCommand, type CommandContext } from '../base-command';

/* ---------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------- */

const URL_RE = /^https?:\/\/.+/;

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface IngestResult {
  ingested: boolean;
  path: string;
  title: string;
  url: string;
  wordCount: number;
  tokenEstimate: number;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ---------------------------------------------------------------------------
 * Idempotency check — search project notes for url: frontmatter match
 * --------------------------------------------------------------------------- */

async function findExistingNote(
  vault: string,
  project: string,
  url: string,
  ops: VaultOps
): Promise<{ path: string; title: string } | null> {
  const entries = await ops.listFiles(vault);
  const prefix = `projects/${project}/`;
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue;
    if (entry.frontmatter['url'] === url) {
      return { path: entry.path, title: (entry.frontmatter['title'] as string) ?? '' };
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Note body patching
 * --------------------------------------------------------------------------- */

async function patchNoteFrontmatter(
  vault: string,
  notePath: string,
  url: string,
  sourceTitle: string,
  sourceDate: string,
  ops: VaultOps
): Promise<void> {
  await ops.updateFrontmatter(vault, notePath, {
    url,
    source_title: sourceTitle,
    source_date: sourceDate,
  });
}

async function patchNoteContent(
  vault: string,
  notePath: string,
  extractedContent: string,
  url: string,
  sourceDate: string,
  ops: VaultOps
): Promise<void> {
  const file = await ops.readFile(vault, notePath);
  const body = file.content;

  const contentMarker = '## Content';
  const idx = body.indexOf(contentMarker);
  if (idx === -1) return;

  const after = body.substring(idx + contentMarker.length);
  const nextSection = after.match(/\n## /);
  const insertAt = nextSection ? idx + contentMarker.length + nextSection.index! : body.length;

  const injected =
    '\n\n' +
    extractedContent +
    '\n\n## Metadata\n\n' +
    '- **Source**: ' +
    url +
    '\n' +
    '- **Date**: ' +
    sourceDate +
    '\n';

  const newBody =
    body.substring(0, idx + contentMarker.length) + injected + body.substring(insertAt);

  await ops.replaceFileContent(vault, notePath, newBody);
}

async function appendParentConnection(
  vault: string,
  project: string,
  parentSlug: string,
  url: string,
  ops: VaultOps
): Promise<void> {
  const projUpper = project.toUpperCase();
  const prefix = `${projUpper}.${parentSlug} - `;
  const projDir = `projects/${project}/`;

  const entries = await ops.listFiles(vault);
  const parentEntry = entries.find(
    e => e.path.startsWith(projDir) && e.path.split('/').pop()?.startsWith(prefix)
  );
  if (!parentEntry) return;

  const file = await ops.readFile(vault, parentEntry.path);
  const body = file.content;

  const marker = '## Connections';
  const idx = body.indexOf(marker);
  if (idx === -1) return;

  const after = body.substring(idx + marker.length);
  const nextSection = after.match(/\n## /);
  const insertAt = nextSection ? idx + marker.length + nextSection.index! : body.length;

  const entry = '\n- sources :: ' + url;
  const newBody = body.substring(0, insertAt) + entry + body.substring(insertAt);

  await ops.replaceFileContent(vault, parentEntry.path, newBody);
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

export async function ingestUrl(
  url: string,
  vault: string,
  project: string,
  parent?: string,
  ops?: VaultOps
): Promise<CommandResult<IngestResult>> {
  const vaultOps = ops ?? getVaultOps();

  /* 1. Validate URL scheme */
  if (!URL_RE.test(url)) {
    return {
      ok: false,
      data: { ingested: false, path: '', title: '', url, wordCount: 0, tokenEstimate: 0 },
      error: `web-ingest: invalid URL — must start with http:// or https:// (got: ${url})`,
    };
  }

  /* 2. Idempotency check */
  const existing = await findExistingNote(vault, project, url, vaultOps).catch(() => null);
  if (existing) {
    return {
      ok: true,
      data: {
        ingested: false,
        path: existing.path,
        title: existing.title,
        url,
        wordCount: 0,
        tokenEstimate: 0,
      },
    };
  }

  /* 3. Fetch content via defuddle */
  let defuddleOut: Awaited<ReturnType<typeof fetchAndParse>>;
  try {
    defuddleOut = await fetchAndParse(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      data: { ingested: false, path: '', title: '', url, wordCount: 0, tokenEstimate: 0 },
      error: `web-ingest: network error — ${msg}`,
    };
  }

  const { title, content } = defuddleOut;
  const sourceDate = defuddleOut.date ?? new Date().toISOString().slice(0, 10);

  /* 4. Generate slug from URL */
  const rawSlug = generateUrlSlug(url);
  if (!Slug.PATTERN.test(rawSlug)) {
    return {
      ok: false,
      data: { ingested: false, path: '', title, url, wordCount: 0, tokenEstimate: 0 },
      error: `web-ingest: generated slug is invalid: ${rawSlug}`,
    };
  }

  const parentSlug = parent ?? 'ROOT';

  /* 5. Create base note via createEntity */
  const entityResult = await createEntity({
    vault,
    project,
    type: 'LEAF',
    slug: rawSlug,
    title,
    parentSlug,
    kind: 'web-source',
    spine: 'external',
  });

  if (!entityResult.ok) {
    return {
      ok: false,
      data: { ingested: false, path: '', title, url, wordCount: 0, tokenEstimate: 0 },
      error: entityResult.error || '',
    };
  }

  const notePath = entityResult.data.path;

  /* 6. Patch frontmatter with web-specific fields */
  try {
    await patchNoteFrontmatter(vault, notePath, url, title, sourceDate, vaultOps);
  } catch {
    /* Non-fatal — note exists, just frontmatter fields missing */
  }

  /* 7. Patch ## Content with extracted markdown + ## Metadata section */
  try {
    await patchNoteContent(vault, notePath, content, url, sourceDate, vaultOps);
  } catch {
    /* Non-fatal */
  }

  /* 8. Append sources connection to parent if explicitly specified */
  if (parent) {
    await appendParentConnection(vault, project, parent, url, vaultOps).catch(() => {
      logWarn('web-ingest/add: failed to append parent connection');
    });
  }

  /* 9. Log to daily note (best-effort) */
  try {
    await vaultOps.appendToDaily(vault, `- Ingested web source: [${title}](${url}) → ${notePath}`);
  } catch {
    /* best-effort */
  }

  const wordCount = countWords(content);
  const tokenEstimate = estimateTokens(content);

  return {
    ok: true,
    data: { ingested: true, path: notePath, title, url, wordCount, tokenEstimate },
  };
}

/* ---------------------------------------------------------------------------
 * CLI command
 * --------------------------------------------------------------------------- */

class AddCommand extends BaseCommand {
  readonly name = 'web-ingest/add';
  readonly description = 'Fetch a URL via defuddle and import it as a LEAF note';
  readonly usage = 'nerv web-ingest/add [--vault <name>] <project> <url> [<parent_slug>] [--json]';
  readonly minPositional = 2;

  protected async execute(ctx: CommandContext): Promise<void> {
    const project = ctx.positional[0];
    const url = ctx.positional[1];
    const parent = ctx.positional[2];

    const result = await ingestUrl(url, ctx.vault, project, parent);

    if (ctx.jsonOutput) {
      process.stdout.write(
        JSON.stringify(result.ok ? result.data : { ingested: false, error: result.error }) + '\n'
      );
      if (!result.ok) process.exit(1);
    } else {
      if (!result.ok) {
        process.stderr.write(`ERROR: ${result.error}\n`);
        process.exit(1);
      }
      if (result.data.ingested) {
        process.stdout.write(`INFO: ingested ${result.data.path}\n`);
        process.stdout.write(`  title:         ${result.data.title}\n`);
        process.stdout.write(`  words:         ${result.data.wordCount}\n`);
        process.stdout.write(`  tokenEstimate: ${result.data.tokenEstimate}\n`);
      } else {
        process.stdout.write(`INFO: URL already ingested — ${result.data.path}\n`);
      }
    }
  }
}

export default new AddCommand();
