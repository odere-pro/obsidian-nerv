/**
 * Shared markdown parsing utilities.
 *
 * Consolidates functions previously duplicated across cli-lint, cli-relations,
 * sync-topk, explain-topic, get-entity, context, and cli-orphans.
 * All functions are pure — no I/O, no Obsidian dependency.
 */

import { SECTION_BODY_LIMIT } from '../constants/limits';

/** Strip YAML frontmatter block from a markdown string. */
export function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
}

/** Extract the body text of a named ## section from note body text. */
export function extractSection(body: string, heading: string): string {
  const sections = body.split(/\n(?=## )/);
  for (const sec of sections) {
    if (new RegExp(`^## ${heading}\\b`).test(sec)) {
      return sec.replace(new RegExp(`^## ${heading}\\n?`), '');
    }
  }
  return '';
}

/**
 * Parse all ## sections from a raw markdown body (including frontmatter).
 * Returns a record mapping section heading to its trimmed content.
 */
export function parseSections(
  rawBody: string,
  maxLength: number = SECTION_BODY_LIMIT
): Record<string, string> {
  const body = stripFrontmatter(rawBody);
  const parts = body.split(/\n(?=## )/);
  const sections: Record<string, string> = {};
  for (const part of parts) {
    const m = part.match(/^## (.+)\n?([\s\S]*)/);
    if (m) {
      sections[m[1].trim()] = (m[2] ?? '').trim().substring(0, maxLength);
    }
  }
  return sections;
}

/**
 * Strip wikilink syntax from a string, returning the raw target name.
 * `[[Some Note|alias]]` becomes `Some Note`.
 */
export function stripWikilink(s: string): string {
  return String(s).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
}

/** Escape special regex characters in a string for safe use in `new RegExp()`. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
