/**
 * web-ingest/batch — Reads a JSON file of URLs and ingests each one.
 * Skips URLs that error; continues with remaining URLs.
 *
 * Input file schema: { "urls": ["https://...", ...], "parent": "parent-slug" (optional) }
 * Output schema:     { "ingested": N, "skipped": M, "failed": K, "totalTokens": N }
 *
 * CLI: nerv web-ingest/batch [--vault <name>] <project> <path-to-json> [--json]
 */

import { parallel } from '../../lib/shell';
import { ingestUrl } from './add';
import { BaseCommand, type CommandContext } from '../base-command';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

interface BatchFile {
  urls: string[];
  parent?: string;
}

interface BatchSummary {
  ingested: number;
  skipped: number;
  failed: number;
  totalTokens: number;
}

/* ---------------------------------------------------------------------------
 * Core
 * --------------------------------------------------------------------------- */

export async function runBatch(
  vault: string,
  project: string,
  batchFile: BatchFile
): Promise<BatchSummary> {
  const { urls, parent } = batchFile;
  const summary: BatchSummary = { ingested: 0, skipped: 0, failed: 0, totalTokens: 0 };

  const results = await parallel(
    urls.map(
      url => () =>
        ingestUrl(url, vault, project, parent).catch(err => ({
          ok: false as const,
          data: { ingested: false, path: '', title: '', url, wordCount: 0, tokenEstimate: 0 },
          error: err instanceof Error ? err.message : String(err),
        }))
    ),
    { concurrency: 5 }
  );

  for (let i = 0; i < results.length; i++) {
    const settled = results[i];
    if (settled.status === 'rejected') {
      summary.failed++;
      process.stderr.write(`WARN: failed to ingest ${urls[i]}: ${settled.reason}\n`);
      continue;
    }

    const result = settled.value;
    if (!result.ok) {
      summary.failed++;
      process.stderr.write(`WARN: failed to ingest ${urls[i]}: ${result.error}\n`);
      continue;
    }

    if (result.data.ingested) {
      summary.ingested++;
      summary.totalTokens += result.data.tokenEstimate;
    } else {
      summary.skipped++;
    }
  }

  return summary;
}

/* ---------------------------------------------------------------------------
 * CLI command
 * --------------------------------------------------------------------------- */

class BatchCommand extends BaseCommand {
  readonly name = 'web-ingest/batch';
  readonly description = 'Ingest multiple URLs from a JSON file into the vault';
  readonly usage = 'nerv web-ingest/batch [--vault <name>] <project> <batch-json-path> [--json]';
  readonly minPositional = 2;

  protected async execute(ctx: CommandContext): Promise<void> {
    const project = ctx.positional[0];
    const batchPath = ctx.positional[1];

    let batchFile: BatchFile;
    try {
      const raw = await Bun.file(batchPath).text();
      batchFile = JSON.parse(raw) as BatchFile;
      if (!Array.isArray(batchFile.urls)) {
        throw new Error('batch file must have a "urls" array');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.out.error(`could not read batch file: ${msg}`);
    }

    const summary = await runBatch(ctx.vault, project, batchFile);

    if (ctx.jsonOutput) {
      process.stdout.write(JSON.stringify(summary) + '\n');
    } else {
      ctx.out.info(
        `batch complete — ingested: ${summary.ingested}, skipped: ${summary.skipped}, failed: ${summary.failed}, totalTokens: ${summary.totalTokens}`
      );
      if (summary.failed > 0) process.exit(1);
    }
  }
}

export default new BatchCommand();
