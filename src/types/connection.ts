/**
 * Connection — typed edge between two entity notes.
 *
 * Parsed from `## Connections` sections in entity markdown:
 *   `- rel :: [[target]]` or `- rel :: [[target]] — context`
 */
export interface Connection {
  /** Relationship type slug, e.g. `depends-on`. Validated against ontology. */
  rel: string;
  /** Target note basename (without extension), e.g. `my-entity`. */
  target: string;
  /** Optional freeform context for the connection. */
  context: string;
}

/** Raw `- rel :: [[target]]` or `- rel :: [[target]] — context` line */
export type ConnectionLine = string;
