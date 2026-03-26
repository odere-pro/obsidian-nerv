// STORY-040 — Web ingestion: web-ingest/add command
//
// Fetches a URL via `defuddle parse`, creates a LEAF note with kind: web-source,
// patches frontmatter with url/source_title/source_date, and writes extracted
// content into the note body.
//
// Programmatic API:  ingestUrl(url, vault, project, parent?)
// CLI:               nerv web-ingest/add <vault> <project> <url> [<parent_slug>] [--json]

import type { Command } from '../../cli.ts';
import type { CommandResult } from '../../types/result.ts';
import { resolveVault, obEval, dailyAppend } from '../../lib/obsidian.ts';
import { encodeForJs } from '../../lib/json.ts';
import { createEntity } from '../create-entity.ts';
import { fetchAndParse, generateUrlSlug } from '../../lib/defuddle.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const URL_RE = /^https?:\/\/.+/;
const SLUG_RE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestResult {
  ingested: boolean;
  path: string;
  title: string;
  url: string;
  wordCount: number;
  tokenEstimate: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Idempotency check — search project notes for url: frontmatter match
// ---------------------------------------------------------------------------

async function findExistingNote(
  vault: string,
  project: string,
  url: string
): Promise<string | null> {
  const jsUrl = encodeForJs(url);
  const jsProjDir = encodeForJs(`projects/${project}`);

  const result = await obEval(
    vault,
    `(async () => {
  var dir = ${jsProjDir};
  var targetUrl = ${jsUrl};
  var files = app.vault.getMarkdownFiles().filter(function(f) {
    return f.path.startsWith(dir + '/');
  });
  for (var i = 0; i < files.length; i++) {
    var meta = app.metadataCache.getFileCache(files[i]);
    if (meta && meta.frontmatter && meta.frontmatter.url === targetUrl) {
      return files[i].path;
    }
  }
  return 'NOT_FOUND';
})()`
  ).catch(() => 'NOT_FOUND');

  return result === 'NOT_FOUND' || !result ? null : result;
}

// ---------------------------------------------------------------------------
// Note body patching
// ---------------------------------------------------------------------------

async function patchNoteFrontmatter(
  vault: string,
  notePath: string,
  url: string,
  sourceTitle: string,
  sourceDate: string
): Promise<void> {
  const jsPath = encodeForJs(notePath);
  const jsUrl = encodeForJs(url);
  const jsSourceTitle = encodeForJs(sourceTitle);
  const jsSourceDate = encodeForJs(sourceDate);

  await obEval(
    vault,
    `(async () => {
  var f = app.vault.getAbstractFileByPath(${jsPath});
  if (!f) return 'not-found';
  await app.fileManager.processFrontMatter(f, function(fm) {
    fm['url'] = ${jsUrl};
    fm['source_title'] = ${jsSourceTitle};
    fm['source_date'] = ${jsSourceDate};
  });
  return 'ok';
})()`
  );
}

async function patchNoteContent(
  vault: string,
  notePath: string,
  extractedContent: string,
  url: string,
  sourceDate: string
): Promise<void> {
  const jsPath = encodeForJs(notePath);
  const jsExtracted = encodeForJs(extractedContent);
  const jsUrl = encodeForJs(url);
  const jsDate = encodeForJs(sourceDate);

  await obEval(
    vault,
    `(async () => {
  var f = app.vault.getAbstractFileByPath(${jsPath});
  if (!f) return 'not-found';
  await app.vault.process(f, function(body) {
    var contentMarker = '## Content';
    var idx = body.indexOf(contentMarker);
    if (idx === -1) return body;
    var after = body.substring(idx + contentMarker.length);
    var nextSection = after.match(/\n## /);
    var insertAt = nextSection
      ? idx + contentMarker.length + nextSection.index
      : body.length;
    var injected = '\n\n' + ${jsExtracted} +
      '\n\n## Metadata\n\n' +
      '- **Source**: ' + ${jsUrl} + '\n' +
      '- **Date**: ' + ${jsDate} + '\n';
    return body.substring(0, idx + contentMarker.length) +
           injected +
           body.substring(insertAt);
  });
  return 'ok';
})()`
  );
}

async function appendParentConnection(
  vault: string,
  project: string,
  parentSlug: string,
  url: string
): Promise<void> {
  const projUpper = project.toUpperCase();
  const jsProjDir = encodeForJs(`projects/${project}`);
  const jsPrefix = encodeForJs(`${projUpper}.${parentSlug} - `);
  const jsUrl = encodeForJs(url);

  await obEval(
    vault,
    `(async () => {
  var projDir = ${jsProjDir};
  var prefix = ${jsPrefix};
  var f = app.vault.getFiles().find(function(f) {
    return f.path.startsWith(projDir + '/') && f.name.startsWith(prefix);
  });
  if (!f) return 'not-found';
  await app.vault.process(f, function(body) {
    var marker = '## Connections';
    var idx = body.indexOf(marker);
    if (idx === -1) return body;
    var after = body.substring(idx + marker.length);
    var nextSection = after.match(/\n## /);
    var insertAt = nextSection
      ? idx + marker.length + nextSection.index
      : body.length;
    var entry = '\n- sources :: ' + ${jsUrl};
    return body.substring(0, insertAt) + entry + body.substring(insertAt);
  });
  return 'ok';
})()`
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

export async function ingestUrl(
  url: string,
  vault: string,
  project: string,
  parent?: string
): Promise<CommandResult<IngestResult>> {
  // 1. Validate URL scheme
  if (!URL_RE.test(url)) {
    return {
      ok: false,
      data: { ingested: false, path: '', title: '', url, wordCount: 0, tokenEstimate: 0 },
      error: `web-ingest: invalid URL — must start with http:// or https:// (got: ${url})`,
    };
  }

  // 2. Idempotency check
  const existing = await findExistingNote(vault, project, url).catch(() => null);
  if (existing) {
    return {
      ok: true,
      data: { ingested: false, path: existing, title: '', url, wordCount: 0, tokenEstimate: 0 },
    };
  }

  // 3. Fetch content via defuddle
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

  // 4. Generate slug from URL
  const rawSlug = generateUrlSlug(url);
  if (!SLUG_RE.test(rawSlug)) {
    return {
      ok: false,
      data: { ingested: false, path: '', title, url, wordCount: 0, tokenEstimate: 0 },
      error: `web-ingest: generated slug is invalid: ${rawSlug}`,
    };
  }

  const parentSlug = parent ?? 'ROOT';

  // 5. Create base note via createEntity
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
      error: entityResult.error,
    };
  }

  const notePath = entityResult.data.path;

  // 6. Patch frontmatter with web-specific fields
  try {
    await patchNoteFrontmatter(vault, notePath, url, title, sourceDate);
  } catch {
    // Non-fatal — note exists, just frontmatter fields missing
  }

  // 7. Patch ## Content with extracted markdown + ## Metadata section
  try {
    await patchNoteContent(vault, notePath, content, url, sourceDate);
  } catch {
    // Non-fatal
  }

  // 8. Append sources connection to parent if explicitly specified
  if (parent) {
    await appendParentConnection(vault, project, parent, url).catch(() => undefined);
  }

  // 9. Log to daily note (best-effort)
  try {
    await dailyAppend(vault, `- Ingested web source: [${title}](${url}) → ${notePath}`);
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

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'web-ingest/add',
  description: 'Fetch a URL via defuddle and import it as a LEAF note',

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
        'Usage: nerv web-ingest/add <vault> <project> <url> [<parent_slug>] [--json]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(positional[0]);
    const project = positional[1];
    const url = positional[2];
    const parent = positional[3];

    const result = await ingestUrl(url, vault, project, parent);

    if (jsonOutput) {
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
  },
};

export default command;
