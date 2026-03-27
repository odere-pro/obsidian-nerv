// Tests validateSpec (pure function): --dry-run, pre-flight validation,
// idempotency marker, YAML injection check. No Obsidian required.

import { describe, expect, test } from 'bun:test';
import { validateSpec, type MigrateOp } from '../migrate';

// ---------------------------------------------------------------------------
// validateSpec — valid specs
// ---------------------------------------------------------------------------

describe('validateSpec valid specs', () => {
  test('accepts a rename-rel operation', () => {
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'triggers', to: 'activates' }];
    expect(validateSpec(spec)).toHaveLength(0);
  });

  test('accepts a rename-spine operation', () => {
    const spec: MigrateOp[] = [{ op: 'rename-spine', from: 'aws', to: 'cloud' }];
    expect(validateSpec(spec)).toHaveLength(0);
  });

  test('accepts an add-field operation with a boolean value', () => {
    const spec: MigrateOp[] = [{ op: 'add-field', field: 'reviewed', value: false }];
    expect(validateSpec(spec)).toHaveLength(0);
  });

  test('accepts a promote operation', () => {
    const spec: MigrateOp[] = [{ op: 'promote', note: 'PREFIX.leaf-slug' }];
    expect(validateSpec(spec)).toHaveLength(0);
  });

  test('accepts multiple operations in one spec', () => {
    const spec: MigrateOp[] = [
      { op: 'rename-rel', from: 'a', to: 'b' },
      { op: 'add-field', field: 'reviewed', value: false },
    ];
    expect(validateSpec(spec)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateSpec — empty / non-array
// ---------------------------------------------------------------------------

describe('validateSpec rejects invalid structure', () => {
  test('rejects empty array', () => {
    const errors = validateSpec([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('non-empty JSON array');
  });

  test('rejects non-array (object)', () => {
    const errors = validateSpec({ op: 'rename-rel' });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('rejects null', () => {
    expect(validateSpec(null).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateSpec — unknown op
// ---------------------------------------------------------------------------

describe('validateSpec rejects unknown op', () => {
  test('reports invalid op value', () => {
    const errors = validateSpec([{ op: 'delete-all' }]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('"op" must be one of');
  });

  test('missing op field', () => {
    const errors = validateSpec([{ from: 'a', to: 'b' }]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateSpec — missing required fields
// ---------------------------------------------------------------------------

describe('validateSpec missing required fields', () => {
  test('rename-rel requires "from"', () => {
    const errors = validateSpec([{ op: 'rename-rel', to: 'activates' }]);
    expect(errors.some(e => e.includes('"from"'))).toBe(true);
  });

  test('rename-rel requires "to"', () => {
    const errors = validateSpec([{ op: 'rename-rel', from: 'triggers' }]);
    expect(errors.some(e => e.includes('"to"'))).toBe(true);
  });

  test('add-field requires "field"', () => {
    const errors = validateSpec([{ op: 'add-field', value: 'x' }]);
    expect(errors.some(e => e.includes('"field"'))).toBe(true);
  });

  test('add-field requires "value"', () => {
    const errors = validateSpec([{ op: 'add-field', field: 'reviewed' }]);
    expect(errors.some(e => e.includes('"value"'))).toBe(true);
  });

  test('promote requires "note"', () => {
    const errors = validateSpec([{ op: 'promote' }]);
    expect(errors.some(e => e.includes('"note"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSpec — add-field specific rules
// ---------------------------------------------------------------------------

describe('validateSpec add-field rules', () => {
  test('rejects "position" as reserved field', () => {
    const errors = validateSpec([{ op: 'add-field', field: 'position', value: 0 }]);
    expect(errors.some(e => e.includes('reserved'))).toBe(true);
  });

  test('rejects field with invalid identifier characters', () => {
    const errors = validateSpec([{ op: 'add-field', field: '123bad', value: 'x' }]);
    expect(errors.some(e => e.includes('simple identifier'))).toBe(true);
  });

  test('rejects string value with colon (YAML-breaking)', () => {
    const errors = validateSpec([{ op: 'add-field', field: 'tag', value: 'a:b' }]);
    expect(errors.some(e => e.includes('YAML-breaking'))).toBe(true);
  });

  test('rejects string value with hash character', () => {
    const errors = validateSpec([{ op: 'add-field', field: 'tag', value: 'a#b' }]);
    expect(errors.some(e => e.includes('YAML-breaking'))).toBe(true);
  });

  test('accepts boolean value (no YAML injection risk)', () => {
    const errors = validateSpec([{ op: 'add-field', field: 'reviewed', value: false }]);
    expect(errors).toHaveLength(0);
  });

  test('accepts number value (no YAML injection risk)', () => {
    const errors = validateSpec([{ op: 'add-field', field: 'score', value: 42 }]);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Idempotency — op returning 0 count is valid (not an error)
// ---------------------------------------------------------------------------

describe('idempotency: zero modified is a valid result', () => {
  test('validateSpec passes a spec that may produce 0 modified notes', () => {
    // The spec itself is valid; idempotency manifests at runtime (0 notes modified)
    const spec: MigrateOp[] = [{ op: 'rename-rel', from: 'already-renamed', to: 'target' }];
    expect(validateSpec(spec)).toHaveLength(0);
  });
});
