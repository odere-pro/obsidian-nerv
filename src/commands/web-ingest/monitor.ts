/* Polls an RSS/Atom feed URL for new articles and ingests each one. */
/* State (last-checked timestamp + seen article URLs) is persisted in */
/* `_inbox/_web-ingest-state.json` inside the vault via VaultOps. */

/* CLI: nerv web-ingest/monitor [--vault <name>] <project> <feed-url> [--interval 3600] [--once] [--max-articles 10] */

import type { Command } from '../../cli';
import { resolveVault } from '../../lib/obsidian';
import { getVaultOps } from '../../ports/provider';
import type { VaultOps } from '../../ports/vault-ops';
import { ingestUrl } from './add';
import { extractVaultFlag } from '../../lib/vault-registry';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface FeedArticle {
  title: string;
  url: string;
  pubDate?: string;
}

export interface MonitorState {
  /** ISO timestamp */
  lastChecked: string;
  seenUrls: string[];
}

/* ---------------------------------------------------------------------------
 * RSS / Atom parsing
 * --------------------------------------------------------------------------- */

/**
 * Extract articles from an RSS 2.0 or Atom feed string.
 * Uses simple regex extraction — robust enough for well-formed feeds.
 */
export function parseFeed(xml: string): FeedArticle[] {
  const articles: FeedArticle[] = [];

  /* Detect Atom vs RSS by presence of <entry> elements */
  const isAtom = xml.includes('<entry');

  if (isAtom) {
    /* Atom feed: <entry>…</entry> */
    const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null) {
      const block = m[1];
      const title = extractTag(block, 'title') ?? '';
      const url = extractAttr(block, 'link', 'href') ?? extractTag(block, 'id') ?? '';
      const pubDate = extractTag(block, 'updated') ?? extractTag(block, 'published');
      if (url) articles.push({ title, url, pubDate: pubDate || '' });
    }
  } else {
    /* RSS 2.0 feed: <item>…</item> */
    const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = extractTag(block, 'title') ?? '';
      const url = extractTag(block, 'link') ?? extractTag(block, 'guid') ?? '';
      const pubDate = extractTag(block, 'pubDate') ?? extractTag(block, 'dc:date');
      if (url) articles.push({ title, url, pubDate: pubDate || '' });
    }
  }

  return articles;
}

function extractTag(xml: string, tag: string): string | undefined {
  /* Escape special regex chars in tag name (e.g. dc:date has a colon) */
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i');
  const m = re.exec(xml);
  if (!m) return undefined;
  /* Strip CDATA wrapper if present */
  const raw = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  return cdata ? cdata[1].trim() : raw;
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escapedTag}[^>]*${escapedAttr}="([^"]*)"`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : undefined;
}

/* ---------------------------------------------------------------------------
 * State management — stored in vault's _inbox/_web-ingest-state.json
 * --------------------------------------------------------------------------- */

const STATE_PATH = '_inbox/_web-ingest-state.json';

export async function loadState(vault: string, ops?: VaultOps): Promise<MonitorState> {
  const vaultOps = ops ?? getVaultOps();
  const exists = await vaultOps.fileExists(vault, STATE_PATH).catch(() => false);
  if (!exists) {
    return { lastChecked: new Date(0).toISOString(), seenUrls: [] };
  }

  try {
    const file = await vaultOps.readFile(vault, STATE_PATH);
    return JSON.parse(file.content) as MonitorState;
  } catch {
    return { lastChecked: new Date(0).toISOString(), seenUrls: [] };
  }
}

export async function saveState(vault: string, state: MonitorState, ops?: VaultOps): Promise<void> {
  const vaultOps = ops ?? getVaultOps();
  const content = JSON.stringify(state, null, 2);
  const exists = await vaultOps.fileExists(vault, STATE_PATH).catch(() => false);

  if (exists) {
    await vaultOps.replaceFileContent(vault, STATE_PATH, content);
  } else {
    await vaultOps.createFile(vault, STATE_PATH, content);
  }
}

/* ---------------------------------------------------------------------------
 * Core poll loop
 * --------------------------------------------------------------------------- */

export interface MonitorOptions {
  /** seconds */
  interval: number;
  once: boolean;
  maxArticles: number;
  parent?: string;
}

export async function runMonitor(
  vault: string,
  project: string,
  feedUrl: string,
  opts: MonitorOptions
): Promise<void> {
  const poll = async (): Promise<void> => {
    const state = await loadState(vault);
    const lastChecked = new Date(state.lastChecked);

    let xml: string;
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      xml = await res.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`WARN: could not fetch feed ${feedUrl}: ${msg}\n`);
      return;
    }

    const articles = parseFeed(xml);
    let processed = 0;

    for (const article of articles) {
      if (processed >= opts.maxArticles) break;
      if (state.seenUrls.includes(article.url)) continue;

      /* Filter by publication date if available */
      if (article.pubDate) {
        const pub = new Date(article.pubDate);
        if (!isNaN(pub.getTime()) && pub <= lastChecked) continue;
      }

      const result = await ingestUrl(article.url, vault, project, opts.parent).catch(err => ({
        ok: false as const,
        data: {
          ingested: false,
          path: '',
          title: '',
          url: article.url,
          wordCount: 0,
          tokenEstimate: 0,
        },
        error: err instanceof Error ? err.message : String(err),
      }));

      if (result.ok && result.data.ingested) {
        process.stdout.write(`INFO: ingested ${article.url} → ${result.data.path}\n`);
        state.seenUrls.push(article.url);
        processed++;
      } else if (!result.ok) {
        process.stderr.write(`WARN: failed to ingest ${article.url}: ${result.error}\n`);
      }
    }

    state.lastChecked = new Date().toISOString();
    await saveState(vault, state).catch(() => undefined);
  };

  if (opts.once) {
    await poll();
    return;
  }

  /* Daemon loop — exit via Ctrl+C */
  process.stdout.write(`INFO: monitor started — feed: ${feedUrl}, interval: ${opts.interval}s\n`);

  await poll();
  const timer = setInterval(() => {
    poll().catch(err => {
      process.stderr.write(
        `ERROR: poll failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
    });
  }, opts.interval * 1000);

  /* Keep process alive; clean up on SIGINT */
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.stdout.write('\nINFO: monitor stopped\n');
    process.exit(0);
  });
}

/* ---------------------------------------------------------------------------
 * CLI command
 * --------------------------------------------------------------------------- */

const command: Command = {
  name: 'web-ingest/monitor',
  description: 'Poll an RSS/Atom feed and ingest new articles',

  async run(args: string[]): Promise<void> {
    let interval = 3600;
    let once = false;
    let maxArticles = 10;
    let parent: string | undefined;

    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--interval' && rest[i + 1]) {
        interval = parseInt(rest[++i], 10) || 3600;
      } else if (rest[i] === '--once') {
        once = true;
      } else if (rest[i] === '--max-articles' && rest[i + 1]) {
        maxArticles = Math.min(parseInt(rest[++i], 10) || 10, 100);
      } else if (rest[i] === '--parent' && rest[i + 1]) {
        parent = rest[++i];
      } else {
        positional.push(rest[i]);
      }
    }

    if (positional.length < 2) {
      process.stderr.write(
        'Usage: nerv web-ingest/monitor [--vault <name>] <project> <feed-url> [--interval 3600] [--once] [--max-articles 10] [--parent slug]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const project = positional[0];
    const feedUrl = positional[1];

    await runMonitor(vault, project, feedUrl, {
      interval,
      once,
      maxArticles,
      parent: parent || '',
    });
  },
};

export default command;
