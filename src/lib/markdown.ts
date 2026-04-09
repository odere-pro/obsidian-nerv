/**
 * Shared markdown parsing utilities.
 *
 * Consolidates functions previously duplicated across cli-lint, cli-relations,
 * and sync-topk. All functions are pure — no I/O, no Obsidian dependency.
 */

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
