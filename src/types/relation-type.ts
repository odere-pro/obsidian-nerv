/**
 * RelationType — constrained value object for relationship type identifiers.
 *
 * Relationship types follow the slug pattern (lowercase alphanumeric + hyphens).
 * The 10 built-in types include inverse and symmetry metadata; custom types
 * defined in project ontology files are also valid.
 */

import { ValidationError } from './errors';
import { Slug } from './slug';

/* ---------------------------------------------------------------------------
 * Relation metadata — inverse and symmetry for the 10 built-in types
 * --------------------------------------------------------------------------- */

export interface RelationMeta {
  readonly inverse: string;
  readonly symmetric: boolean;
}

/**
 * Built-in relationship types with inverse/symmetry metadata.
 * Custom project-specific types are parsed at runtime from ontology files.
 */
export const BUILTIN_RELATIONS: ReadonlyMap<string, RelationMeta> = new Map([
  ['triggers', { inverse: 'triggered-by', symmetric: false }],
  ['triggered-by', { inverse: 'triggers', symmetric: false }],
  ['depends-on', { inverse: 'depended-by', symmetric: false }],
  ['depended-by', { inverse: 'depends-on', symmetric: false }],
  ['implements', { inverse: 'implemented-by', symmetric: false }],
  ['implemented-by', { inverse: 'implements', symmetric: false }],
  ['extends', { inverse: 'extended-by', symmetric: false }],
  ['extended-by', { inverse: 'extends', symmetric: false }],
  ['compares-to', { inverse: 'compares-to', symmetric: true }],
  ['replaces', { inverse: 'replaced-by', symmetric: false }],
  ['replaced-by', { inverse: 'replaces', symmetric: false }],
  ['feeds-data', { inverse: 'fed-by', symmetric: false }],
  ['fed-by', { inverse: 'feeds-data', symmetric: false }],
  ['authenticates-via', { inverse: 'authenticates', symmetric: false }],
  ['authenticates', { inverse: 'authenticates-via', symmetric: false }],
  ['contains', { inverse: 'contained-by', symmetric: false }],
  ['contained-by', { inverse: 'contains', symmetric: false }],
  ['mitigates', { inverse: 'mitigated-by', symmetric: false }],
  ['mitigated-by', { inverse: 'mitigates', symmetric: false }],
]);

/* ---------------------------------------------------------------------------
 * RelationType value object
 * --------------------------------------------------------------------------- */

export class RelationType {
  readonly value: string;

  constructor(raw: string) {
    if (!Slug.PATTERN.test(raw)) {
      throw new ValidationError(
        `Relation type must be lowercase alphanumeric with hyphens (got: ${raw})`,
        'rel'
      );
    }
    this.value = raw;
  }

  toString(): string {
    return this.value;
  }

  equals(other: RelationType): boolean {
    return this.value === other.value;
  }

  /** Look up inverse/symmetry metadata. Returns undefined for custom types. */
  meta(): RelationMeta | undefined {
    return BUILTIN_RELATIONS.get(this.value);
  }

  /** Return the inverse type, or undefined if unknown. */
  inverse(): string | undefined {
    return BUILTIN_RELATIONS.get(this.value)?.inverse;
  }

  /** Return true if this is a symmetric relation. */
  isSymmetric(): boolean {
    return BUILTIN_RELATIONS.get(this.value)?.symmetric ?? false;
  }

  /** Return true if this is one of the 10 built-in types (or their inverses). */
  isBuiltin(): boolean {
    return BUILTIN_RELATIONS.has(this.value);
  }

  static tryCreate(raw: string): RelationType | null {
    if (!Slug.PATTERN.test(raw)) return null;
    return new RelationType(raw);
  }

  /**
   * Parse a raw string into a RelationType, returning null for invalid input.
   * Alias for tryCreate — preferred name at parse boundaries.
   */
  static parse(raw: string): RelationType | null {
    return RelationType.tryCreate(raw);
  }
}
