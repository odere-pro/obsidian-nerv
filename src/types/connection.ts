/**
 * Connection — typed edge between two entity notes.
 *
 * Parsed from `## Connections` sections in entity markdown:
 *   `- rel :: [[target]]` or `- rel :: [[target]] — context`
 */

import type { RelationType } from './relation-type';

export interface Connection {
  /**
   * Relationship type, validated via RelationType.parse() at ingestion.
   * Use `.value` to get the raw slug string (e.g. `depends-on`).
   */
  rel: RelationType;
  /** Target note basename (without extension), e.g. `my-entity`. */
  target: string;
  /** Optional freeform context for the connection. */
  context: string;
}

/** Raw `- rel :: [[target]]` or `- rel :: [[target]] — context` line */
export type ConnectionLine = string;
