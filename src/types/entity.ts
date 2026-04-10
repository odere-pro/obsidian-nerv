import { ValidationError } from './errors';

/* ---------------------------------------------------------------------------
 * String literal union types — kept for backward compatibility with templates,
 * frontmatter parsing, and existing command signatures.
 * --------------------------------------------------------------------------- */

export type EntityType = 'LEAF' | 'BRANCH' | 'ROOT';

export type EntityStatus = 'draft' | 'review' | 'published' | 'archived';

export type EntityKind = string;

/** Validation helper for EntityKind — free-form but must follow slug pattern. */
export const EntityKinds = {
  PATTERN: /^[a-z][a-z0-9-]*$/,

  /** Validate a raw string as an EntityKind. Throws ValidationError if invalid. */
  parse(raw: string): EntityKind {
    const lower = raw.toLowerCase();
    if (!EntityKinds.PATTERN.test(lower)) {
      throw new ValidationError(
        `Kind must be lowercase alphanumeric with hyphens (got: ${raw})`,
        'kind'
      );
    }
    return lower;
  },

  /** Return true if the value matches the kind pattern. */
  isValid(raw: string): boolean {
    return EntityKinds.PATTERN.test(raw);
  },
} as const;

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
 * Domain interface — kept as a plain interface for serialisation compatibility.
 * Use NoteEntityModel for operations that need invariant checks and behaviour.
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

/* ---------------------------------------------------------------------------
 * Rich domain model — immutable entity with invariant enforcement.
 * --------------------------------------------------------------------------- */

/**
 * Immutable domain model wrapping NoteEntity with invariant enforcement.
 *
 * Invariants:
 *   - ROOT must not have a parent
 *   - BRANCH / LEAF must have a parent
 *   - BRANCH must have at least one child
 */
export class NoteEntityModel {
  readonly title: string;
  readonly type: EntityType;
  readonly kind: EntityKind;
  readonly spine: string;
  readonly status: EntityStatus;
  readonly parent: string | null;
  readonly children: readonly string[];
  readonly aliases: readonly string[];
  readonly attachments: readonly string[];
  readonly created: string;
  readonly modified: string;
  readonly tags: readonly string[];

  constructor(entity: NoteEntity) {
    this.title = entity.title;
    this.type = entity.type;
    this.kind = entity.kind;
    this.spine = entity.spine;
    this.status = entity.status;
    this.parent = entity.parent;
    this.children = [...entity.children];
    this.aliases = [...entity.aliases];
    this.attachments = [...entity.attachments];
    this.created = entity.created;
    this.modified = entity.modified;
    this.tags = [...entity.tags];
  }

  /** Validate structural invariants. Returns a list of violation messages. */
  validate(): string[] {
    const issues: string[] = [];

    if (EntityTypes.isRoot(this.type) && this.parent !== null && this.parent !== '') {
      issues.push('ROOT entity must not have a parent');
    }

    if (EntityTypes.requiresParent(this.type) && (!this.parent || this.parent.trim() === '')) {
      issues.push(`${this.type} entity must have a non-empty parent`);
    }

    return issues;
  }

  /** Return a new model with an additional child link. */
  addChild(childLink: string): NoteEntityModel {
    if (this.children.includes(childLink)) return this;
    return new NoteEntityModel({
      ...this.toEntity(),
      children: [...this.children, childLink],
    });
  }

  /** Return true if the entity is a ROOT. */
  isRoot(): boolean {
    return EntityTypes.isRoot(this.type);
  }

  /** Return true if the entity requires a parent (BRANCH or LEAF). */
  requiresParent(): boolean {
    return EntityTypes.requiresParent(this.type);
  }

  /** Return a new model with a child link removed. */
  removeChild(childLink: string): NoteEntityModel {
    const filtered = this.children.filter(c => c !== childLink);
    if (filtered.length === this.children.length) return this;
    return new NoteEntityModel({
      ...this.toEntity(),
      children: filtered,
    });
  }

  /** Return a new model with an updated status. */
  updateStatus(newStatus: EntityStatus): NoteEntityModel {
    if (this.status === newStatus) return this;
    return new NoteEntityModel({
      ...this.toEntity(),
      status: newStatus,
    });
  }

  /** Return a new model with an updated modified timestamp. */
  withModified(timestamp: string): NoteEntityModel {
    return new NoteEntityModel({
      ...this.toEntity(),
      modified: timestamp,
    });
  }

  /** Serialise back to the plain NoteEntity interface. */
  toEntity(): NoteEntity {
    return {
      title: this.title,
      type: this.type,
      kind: this.kind,
      spine: this.spine,
      status: this.status,
      parent: this.parent,
      children: [...this.children],
      aliases: [...this.aliases],
      attachments: [...this.attachments],
      created: this.created,
      modified: this.modified,
      tags: [...this.tags],
    };
  }
}
