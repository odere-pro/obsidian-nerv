// STORY-040 — Web ingestion: web-ingest/batch command
//
// Reads a JSON file containing an array of URLs and ingests each one.
// Skips URLs that error; continues with remaining URLs.
//
// Input file schema: { "urls": ["https://...", ...], "parent": "parent-slug" (optional) }
// Output schema:     { "ingested": N, "skipped": M, "failed": K, "totalTokens": N }
//
// CLI: nerv web-ingest/batch <vault> <project> <path-to-json> [--json]

import type { Command } from '../../cli';
import { resolveVault } from '../../lib/obsidian';
import { ingestUrl } from './add';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export async function runBatch(
  vault: string,
  project: string,
  batchFile: BatchFile
): Promise<BatchSummary> {
  const { urls, parent } = batchFile;
  const summary: BatchSummary = { ingested: 0, skipped: 0, failed: 0, totalTokens: 0 };

  for (const url of urls) {
    const result = await ingestUrl(url, vault, project, parent).catch(err => ({
      ok: false as const,
      data: { ingested: false, path: '', title: '', url, wordCount: 0, tokenEstimate: 0 },
      error: err instanceof Error ? err.message : String(err),
    }));

    if (!result.ok) {
      summary.failed++;
      process.stderr.write(`WARN: failed to ingest ${url}: ${result.error}\n`);
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

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'web-ingest/batch',
  description: 'Ingest multiple URLs from a JSON file into the vault',

  async run(args: string[]): Promise<void> {
    let jsonOutput = false;
    const positional = args.filter(a => {
      if (a === '--json') {
        jsonOutput = true;
        return false;
      }
      return true;
    });

    if (positional.length < 3) {
      process.stderr.write(
        'Usage: nerv web-ingest/batch <vault> <project> <batch-json-path> [--json]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(positional[0]);
    const project = positional[1];
    const batchPath = positional[2];

    let batchFile: BatchFile;
    try {
      const raw = await Bun.file(batchPath).text();
      batchFile = JSON.parse(raw) as BatchFile;
      if (!Array.isArray(batchFile.urls)) {
        throw new Error('batch file must have a "urls" array');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`ERROR: could not read batch file: ${msg}\n`);
      process.exit(1);
    }

    const summary = await runBatch(vault, project, batchFile);

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(summary) + '\n');
    } else {
      process.stdout.write(
        `INFO: batch complete — ingested: ${summary.ingested}, skipped: ${summary.skipped}, failed: ${summary.failed}, totalTokens: ${summary.totalTokens}\n`
      );
      if (summary.failed > 0) process.exit(1);
    }
  },
};

export default command;
