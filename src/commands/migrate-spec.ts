/**
 * migrate-spec — Pure validation logic for migration specs.
 *
 * Extracted from migrate.ts to keep spec validation testable
 * without any Obsidian or CLI dependencies.
 */

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface MigrateOp {
  op: 'rename-rel' | 'rename-spine' | 'add-field' | 'promote';
  from?: string;
  to?: string;
  field?: string;
  value?: unknown;
  filter?: Record<string, string>;
  note?: string;
}

export interface OpResult {
  op: string;
  count: number;
  notes: string[];
  from?: string;
  to?: string;
  field?: string;
  value?: unknown;
  error?: string;
}

export interface MigrateResult {
  dryRun: boolean;
  ops: OpResult[];
  totalModified: number;
  validationFailed?: boolean;
  errors?: string[];
}

/* ---------------------------------------------------------------------------
 * Spec validation — pure function, testable without Obsidian
 * --------------------------------------------------------------------------- */

const VALID_OPS = new Set(['rename-rel', 'rename-spine', 'add-field', 'promote']);

const REQUIRED_FIELDS: Record<string, string[]> = {
  'rename-rel': ['from', 'to'],
  'rename-spine': ['from', 'to'],
  'add-field': ['field', 'value'],
  promote: ['note'],
};

const YAML_BREAKING = /[:#[\]]/;

/**
 * Validate a migration spec array. Returns an array of error strings.
 * Empty array means the spec is valid.
 */
export function validateSpec(spec: unknown): string[] {
  const errors: string[] = [];

  if (!Array.isArray(spec) || spec.length === 0) {
    errors.push('spec must be a non-empty JSON array');
    return errors;
  }

  for (let i = 0; i < spec.length; i++) {
    const opDef = spec[i] as Record<string, unknown>;

    if (typeof opDef !== 'object' || opDef === null) {
      errors.push(`spec[${i}]: each operation must be a JSON object`);
      continue;
    }

    const op = opDef.op as string;
    if (!VALID_OPS.has(op)) {
      errors.push(
        `spec[${i}]: "op" must be one of ${[...VALID_OPS].sort().join(', ')} (got: "${op ?? ''}")`
      );
      continue;
    }

    for (const req of REQUIRED_FIELDS[op]) {
      if (!(req in opDef)) {
        errors.push(`spec[${i}] (${op}): missing required field "${req}"`);
      }
    }

    if (op === 'add-field') {
      const field = opDef.field;
      if (typeof field !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(field)) {
        errors.push(
          `spec[${i}] (add-field): "field" must be a simple identifier (got: "${field ?? ''}")`
        );
      }
      if (field === 'position') {
        errors.push(`spec[${i}] (add-field): "position" is a reserved Obsidian field`);
      }
      const value = opDef.value;
      if (typeof value === 'string' && YAML_BREAKING.test(value)) {
        errors.push(`spec[${i}] (add-field): value contains YAML-breaking characters (: # [ ])`);
      }
    }
  }

  return errors;
}
