/**
 * explain-parsers — Section parsing and link extraction helpers.
 *
 * Extracted from explain-topic.ts to separate pure parsing logic
 * from vault I/O and orchestration.
 */

import { SUMMARY_BODY_LIMIT } from '../constants/limits';
import { RelationType } from '../types/relation-type';
import { extractSection, stripFrontmatter } from './markdown';

/* ---------------------------------------------------------------------------
 * Section parsers
 * --------------------------------------------------------------------------- */

/** Extract the ## Summary section content, truncated to SUMMARY_BODY_LIMIT. */
export function extractSummary(rawBody: string): string {
  const body = stripFrontmatter(rawBody);
  const raw = extractSection(body, 'Summary');
  return raw.substring(0, SUMMARY_BODY_LIMIT);
}

/** Parse typed connections from the ## Connections section. */
export function parseConnections(
  rawBody: string
): Array<{ rel: string; target: string; context: string }> {
  const body = stripFrontmatter(rawBody);
  const parts = body.split(/\n(?=## )/);
  let connSection = '';
  for (const part of parts) {
    if (/^## Connections\b/.test(part)) {
      connSection = part.replace(/^## Connections\n?/, '');
      break;
    }
  }
  const re = /^- ([a-z][\w-]*) :: \[\[([^\]]+)\]\](.*)?$/;
  const result: Array<{ rel: string; target: string; context: string }> = [];
  for (const line of connSection.split('\n')) {
    const m = line.trim().match(re);
    if (m && RelationType.parse(m[1])) {
      result.push({ rel: m[1], target: m[2], context: (m[3] ?? '').trim() });
    }
  }
  return result;
}

/** Resolve a raw wikilink value to its basename. */
export function resolveWikiLink(raw: string): string {
  const m = String(raw ?? '').match(/\[\[([^\]#|]+)/);
  return m ? m[1].trim() : String(raw ?? '').trim();
}

/* ---------------------------------------------------------------------------
 * Link extraction helpers
 * --------------------------------------------------------------------------- */

export interface LinkRef {
  path: string;
  title: string;
  display: string;
}

/** Extract all outgoing wikilinks from raw markdown body. */
export function extractOutgoingLinks(rawBody: string): LinkRef[] {
  const re = /\[\[([^\]#|]+)(?:\|([^\]]*))?\]\]/g;
  const links: LinkRef[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawBody)) !== null) {
    const target = m[1].trim();
    const display = m[2]?.trim() ?? target;
    links.push({ path: '', title: target, display });
  }
  return links;
}

export interface BacklinkRef {
  path: string;
  title: string;
  type: string;
  kind: string;
  spine: string;
}

/** Build backlinks from all notes that link to the given target basename. */
export function buildBacklinks(
  notes: ReadonlyArray<{
    basename: string;
    path: string;
    frontmatter: Record<string, unknown>;
    outgoing: LinkRef[];
  }>,
  targetBasename: string
): BacklinkRef[] {
  const backlinks: BacklinkRef[] = [];
  for (const n of notes) {
    if (n.basename === targetBasename) continue;
    for (const link of n.outgoing) {
      if (link.title === targetBasename || link.display === targetBasename) {
        backlinks.push({
          path: n.path,
          title: String(n.frontmatter['title'] ?? n.basename),
          type: String(n.frontmatter['type'] ?? ''),
          kind: String(n.frontmatter['kind'] ?? ''),
          spine: String(n.frontmatter['spine'] ?? ''),
        });
        break;
      }
    }
  }
  return backlinks;
}
