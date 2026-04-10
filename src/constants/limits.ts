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
