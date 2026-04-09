/**
 * Value Object for validated slugs.
 *
 * Encapsulates the slug validation rule that was previously duplicated
 * across create-entity, create-project, import-json, weekly-review, and
 * web-ingest/add. A Slug is immutable and always valid after construction.
 */

import { ValidationError } from './errors';

export class Slug {
  static readonly PATTERN = /^[a-z0-9][a-z0-9-]*$/;

  readonly value: string;

  constructor(raw: string) {
    if (!Slug.PATTERN.test(raw)) {
      throw new ValidationError(
        `Slug must be lowercase alphanumeric with hyphens (got: ${raw})`,
        'slug'
      );
    }
    this.value = raw;
  }

  toString(): string {
    return this.value;
  }

  toUpperCase(): string {
    return this.value.toUpperCase();
  }

  equals(other: Slug): boolean {
    return this.value === other.value;
  }

  /**
   * Try to create a Slug, returning null on invalid input
   * instead of throwing.
   */
  static tryCreate(raw: string): Slug | null {
    if (!Slug.PATTERN.test(raw)) return null;
    return new Slug(raw);
  }
}
