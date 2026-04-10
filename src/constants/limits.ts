/**
 * Centralised domain limits used across commands.
 *
 * Keeps magic numbers in one place so lint rules, sync, and validation
 * stay consistent when thresholds change.
 */

/** Maximum typed connections per entity note. */
export const CONNECTION_LIMIT = 7;

/** Maximum callout flags (> [!flag]) per entity note. */
export const FLAG_LIMIT = 3;

/** Maximum children for a BRANCH entity. */
export const CHILDREN_LIMIT = 7;

/** Default number of recent files shown in morning briefing. */
export const RECENT_FILES_LIMIT = 10;

/** Maximum items displayed before "... and N more" truncation. */
export const DISPLAY_TRUNCATION_LIMIT = 10;

/** Default body substring limit for section content (characters). */
export const SECTION_BODY_LIMIT = 3000;

/** Short body substring limit for summaries (characters). */
export const SUMMARY_BODY_LIMIT = 500;

/** Maximum rows in the overflow log before operator cleanup is required. */
export const OVERFLOW_LOG_CAP = 200;

/** Minimum word count for a note to be considered non-stub. */
export const STUB_WORD_THRESHOLD = 100;

/**
 * Filename prefixes for generated artifacts (ontology, vocab, topk, templates).
 * Notes matching these prefixes are excluded from entity-level operations.
 */
export const EXCLUDED_PREFIXES = ['_vocab', '_topk', '_ontology', 'tpl-'];

/** Returns true when `name` is a user-authored entity note (not a generated artifact). */
export function isEntityNote(name: string): boolean {
  return !EXCLUDED_PREFIXES.some(p => name.startsWith(p));
}
