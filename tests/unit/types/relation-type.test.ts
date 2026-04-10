/**
 * Tests for RelationType value object — validation, parse boundary, and metadata.
 */

import { describe, expect, test } from 'bun:test';
import { BUILTIN_RELATIONS, RelationType } from '../../../src/types/relation-type';

describe('RelationType.parse', () => {
  test('returns RelationType for valid slug', () => {
    const rt = RelationType.parse('depends-on');
    expect(rt).not.toBeNull();
    expect(rt!.value).toBe('depends-on');
  });

  test('returns null for uppercase input', () => {
    expect(RelationType.parse('Depends-On')).toBeNull();
  });

  test('returns null for input with spaces', () => {
    expect(RelationType.parse('depends on')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(RelationType.parse('')).toBeNull();
  });

  test('returns null for input with underscores', () => {
    expect(RelationType.parse('depends_on')).toBeNull();
  });

  test('accepts custom project-specific slugs', () => {
    const rt = RelationType.parse('my-custom-rel');
    expect(rt).not.toBeNull();
    expect(rt!.value).toBe('my-custom-rel');
  });
});

describe('RelationType metadata', () => {
  test('builtin types have inverse metadata', () => {
    const rt = new RelationType('depends-on');
    expect(rt.inverse()).toBe('depended-by');
    expect(rt.isBuiltin()).toBe(true);
  });

  test('symmetric relation reports isSymmetric', () => {
    const rt = new RelationType('compares-to');
    expect(rt.isSymmetric()).toBe(true);
    expect(rt.inverse()).toBe('compares-to');
  });

  test('custom types have no builtin metadata', () => {
    const rt = new RelationType('my-custom');
    expect(rt.isBuiltin()).toBe(false);
    expect(rt.inverse()).toBeUndefined();
    expect(rt.isSymmetric()).toBe(false);
  });

  test('all builtin relations have inverses', () => {
    for (const [, meta] of BUILTIN_RELATIONS) {
      expect(meta.inverse).toBeTruthy();
      expect(BUILTIN_RELATIONS.has(meta.inverse)).toBe(true);
    }
  });
});

describe('RelationType equality', () => {
  test('equals compares by value', () => {
    const a = new RelationType('depends-on');
    const b = new RelationType('depends-on');
    expect(a.equals(b)).toBe(true);
  });

  test('toString returns the raw value', () => {
    const rt = new RelationType('triggers');
    expect(rt.toString()).toBe('triggers');
    expect(`${rt}`).toBe('triggers');
  });
});
