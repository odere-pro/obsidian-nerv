import { ValidationError } from './errors';

/* ---------------------------------------------------------------------------
 * String literal union types — kept for backward compatibility with templates,
 * frontmatter parsing, and existing command signatures.
 * --------------------------------------------------------------------------- */

export type EntityType = 'LEAF' | 'BRANCH' | 'ROOT';

export type EntityStatus = 'draft' | 'review' | 'published' | 'archived';

export type EntityKind = string;

/* ---------------------------------------------------------------------------
 * Companion utilities — centralise validation that was previously duplicated
 * in create-entity, import-json, and other commands.
 * --------------------------------------------------------------------------- */

/** Validated set of EntityType values with parsing and query helpers. */
export const EntityTypes = {
  ALL: ['LEAF', 'BRANCH', 'ROOT'] as readonly EntityType[],

  /** Parse a raw string into a valid EntityType, or throw ValidationError. */
  parse(raw: string): EntityType {
    const upper = raw.toUpperCase();
    if (upper === 'LEAF' || upper === 'BRANCH' || upper === 'ROOT') {
      return upper as EntityType;
    }
    throw new ValidationError(`TYPE must be LEAF, BRANCH, or ROOT (got: ${raw})`, 'type');
  },

  /** Return true if the value requires a parent (BRANCH or LEAF). */
  requiresParent(type: EntityType): boolean {
    return type === 'BRANCH' || type === 'LEAF';
  },

  /** Return true if the value is a ROOT type. */
  isRoot(type: EntityType): boolean {
    return type === 'ROOT';
  },
} as const;

/** Validated set of EntityStatus values with a parsing helper. */
export const EntityStatuses = {
  ALL: ['draft', 'review', 'published', 'archived'] as readonly EntityStatus[],

  /** Parse a raw string into a valid EntityStatus, or throw ValidationError. */
  parse(raw: string): EntityStatus {
    const lower = raw.toLowerCase();
    if (lower === 'draft' || lower === 'review' || lower === 'published' || lower === 'archived') {
      return lower as EntityStatus;
    }
    throw new ValidationError(
      `Status must be draft, review, published, or archived (got: ${raw})`,
      'status'
    );
  },
} as const;

/** Required frontmatter fields for entity validation (lint, knowledge-gap). */
export const ENTITY_REQUIRED_FIELDS = [
  'title',
  'type',
  'kind',
  'spine',
  'status',
  'created',
  'aliases',
] as const;

/* ---------------------------------------------------------------------------
 * Domain interface
 * --------------------------------------------------------------------------- */

export interface NoteEntity {
  title: string;
  type: EntityType;
  kind: EntityKind;
  spine: string;
  status: EntityStatus;
  parent: string | null;
  children: string[];
  aliases: string[];
  attachments: string[];
  /** ISO date string */
  created: string;
  /** ISO date string */
  modified: string;
  tags: string[];
}
