// migrate — Schema migration skill: apply bulk schema changes from a declarative spec.
//
// Spec format (JSON array of operations):
//   [
//     {"op":"rename-rel",   "from":"triggers",  "to":"activates"},
//     {"op":"rename-spine", "from":"aws",        "to":"cloud"},
//     {"op":"add-field",    "field":"reviewed",  "value":false, "filter":{"type":"LEAF"}},
//     {"op":"promote",      "note":"PREFIX.leaf-slug"}
//   ]
//
// Flags:
//   --dry-run   Report changes without modifying any files
//
// Pre-flight validation runs before any modification (identical logic for dry-run and apply).
// Idempotent: re-running an applied migration exits 0 with 0 notes modified per operation.
// promote uses fileManager.renameFile for automatic wikilink updates.
// Path traversal protection: asserts new path starts with projects/<slug>/ before rename.
//
// Post-apply: appends migration summary to daily note; writes rollback log entry.

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { obEval, resolveVault, rollbackLog } from '../lib/obsidian';
import { extractVaultFlag } from '../lib/vault-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Spec validation — pure function, testable without Obsidian
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Migration IIFE builder
// ---------------------------------------------------------------------------

function buildMigrateExpr(spec: MigrateOp[], slug: string, dryRun: boolean): string {
  const jsSpec = encodeForJs(JSON.stringify(spec));
  const jsSlug = encodeForJs(slug);
  const jsDryRun = dryRun ? 'true' : 'false';

  return `(async () => {
  var spec     = JSON.parse(${jsSpec});
  var projSlug = ${jsSlug};
  var dryRun   = ${jsDryRun};

  var projFolder = 'projects/' + projSlug;
  var allFiles   = app.vault.getMarkdownFiles();
  var projFiles  = allFiles.filter(function(f){
    return f.path.startsWith(projFolder + '/');
  });

  var escRe = function(s) {
    return s.replace(/[.*+?^${'$'}{}()|[\\]\\\\]/g, '\\\\$&');
  };

  var findArtifact = function(prefix) {
    return projFiles.find(function(f){
      return f.basename === '_' + prefix + '.' + projSlug;
    }) || null;
  };

  var todayStr = function() {
    return new Date().toISOString().split('T')[0];
  };

  // Pre-flight validation
  var errors    = [];
  var ontFile   = findArtifact('ontology');

  for (var vi = 0; vi < spec.length; vi++) {
    var vsop = spec[vi];
    var vop  = vsop.op;

    if (vop === 'rename-rel') {
      if (!ontFile) {
        errors.push('rename-rel[' + vi + ']: _ontology.' + projSlug + '.md not found in ' + projFolder);
        continue;
      }
      var ontBody = await app.vault.cachedRead(ontFile);
      var fromEscV = escRe(vsop.from);
      if (!new RegExp('\`' + fromEscV + '\`').test(ontBody)) {
        errors.push('rename-rel[' + vi + ']: relationship type "' + vsop.from +
          '" not found in _ontology.' + projSlug + '.md');
      }
    } else if (vop === 'rename-spine') {
      var spineHits = projFiles.filter(function(f) {
        var c = app.metadataCache.getFileCache(f);
        return c && c.frontmatter && c.frontmatter.spine === vsop.from;
      });
      if (spineHits.length === 0) {
        errors.push('rename-spine[' + vi + ']: no notes with spine "' + vsop.from +
          '" found in ' + projFolder);
      }
    } else if (vop === 'promote') {
      var noteSearch = vsop.note || '';
      var candidate  = projFiles.find(function(f) {
        return f.basename === noteSearch ||
               f.basename.startsWith(noteSearch + ' - ') ||
               f.basename.toLowerCase().indexOf(noteSearch.toLowerCase()) !== -1;
      });
      if (!candidate) {
        errors.push('promote[' + vi + ']: note matching "' + noteSearch +
          '" not found in ' + projFolder);
      }
    }
  }

  if (errors.length > 0) {
    return JSON.stringify({ validationFailed: true, errors: errors });
  }

  // Execute operations
  var opResults = [];
  var vocabFile = findArtifact('vocab');

  for (var oi = 0; oi < spec.length; oi++) {
    var sop   = spec[oi];
    var op    = sop.op;
    var count = 0;
    var notes = [];

    if (op === 'rename-rel') {
      var fromRel  = sop.from;
      var toRel    = sop.to;
      var fromEscR = escRe(fromRel);

      for (var fi = 0; fi < projFiles.length; fi++) {
        var f = projFiles[fi];
        if (f.basename.startsWith('_')) continue;
        var body = await app.vault.cachedRead(f);
        if (!new RegExp('^(- )' + fromEscR + '( :: \\\\[\\\\[)', 'gm').test(body)) continue;
        if (!dryRun) {
          var captFE = fromEscR; var captTo = toRel;
          await app.vault.process(f, function(content) {
            return content.replace(
              new RegExp('^(- )' + captFE + '( :: \\\\[\\\\[)', 'gm'),
              '$1' + captTo + '$2'
            );
          });
        }
        count++;
        notes.push(f.path);
      }
      if (ontFile) {
        var ontBody2   = await app.vault.cachedRead(ontFile);
        var fromEscOnt = escRe(fromRel);
        if (new RegExp('\`' + fromEscOnt + '\`').test(ontBody2) && !dryRun) {
          var captFO = fromEscOnt; var captTO = toRel;
          await app.vault.process(ontFile, function(content) {
            return content.replace(new RegExp('\`' + captFO + '\`', 'g'), '\`' + captTO + '\`');
          });
          await app.fileManager.processFrontMatter(ontFile, function(fm) { fm.updated = todayStr(); });
        }
      }
      opResults.push({ op: op, from: fromRel, to: toRel, count: count, notes: notes });

    } else if (op === 'rename-spine') {
      var fromSpine = sop.from;
      var toSpine   = sop.to;
      for (var fi = 0; fi < projFiles.length; fi++) {
        var f      = projFiles[fi];
        var fcache = app.metadataCache.getFileCache(f);
        var ffm    = (fcache && fcache.frontmatter) ? fcache.frontmatter : {};
        if (ffm.spine !== fromSpine) continue;
        if (!dryRun) {
          var captTS = toSpine;
          await app.fileManager.processFrontMatter(f, function(fmRef) { fmRef.spine = captTS; });
        }
        count++;
        notes.push(f.path);
      }
      if (vocabFile && !dryRun) {
        var fromSpineEsc = escRe(fromSpine);
        var vocabBody    = await app.vault.cachedRead(vocabFile);
        if (vocabBody.indexOf(fromSpine) !== -1) {
          var captFS = fromSpineEsc; var captTSV = toSpine;
          await app.vault.process(vocabFile, function(content) {
            return content.replace(new RegExp(captFS, 'g'), captTSV);
          });
          await app.fileManager.processFrontMatter(vocabFile, function(fm) {
            if (fm.spine === fromSpine) fm.spine = toSpine;
            fm.updated = todayStr();
          });
        }
      }
      opResults.push({ op: op, from: fromSpine, to: toSpine, count: count, notes: notes });

    } else if (op === 'add-field') {
      var fieldName  = sop.field;
      var fieldValue = sop.value;
      var filter     = sop.filter || {};
      for (var fi = 0; fi < projFiles.length; fi++) {
        var f      = projFiles[fi];
        if (f.basename.startsWith('_')) continue;
        var fcache = app.metadataCache.getFileCache(f);
        var ffm    = (fcache && fcache.frontmatter) ? fcache.frontmatter : {};
        if (filter.type   && ffm.type   !== filter.type  ) continue;
        if (filter.spine  && ffm.spine  !== filter.spine ) continue;
        if (filter.kind   && ffm.kind   !== filter.kind  ) continue;
        if (filter.status && ffm.status !== filter.status) continue;
        if (fieldName in ffm) continue;  // idempotent
        if (!dryRun) {
          var captFN = fieldName; var captFV = fieldValue;
          await app.fileManager.processFrontMatter(f, function(fmRef) { fmRef[captFN] = captFV; });
        }
        count++;
        notes.push(f.path);
      }
      opResults.push({ op: op, field: fieldName, value: fieldValue, count: count, notes: notes });

    } else if (op === 'promote') {
      var noteSearch = sop.note || '';
      var pf = projFiles.find(function(f) {
        return f.basename === noteSearch ||
               f.basename.startsWith(noteSearch + ' - ') ||
               f.basename.toLowerCase().indexOf(noteSearch.toLowerCase()) !== -1;
      });
      if (pf) {
        var pCache = app.metadataCache.getFileCache(pf);
        var pFm    = (pCache && pCache.frontmatter) ? pCache.frontmatter : {};
        if (pFm.type === 'BRANCH') {
          opResults.push({ op: op, note: noteSearch, from: pf.path, to: pf.path, count: 0, notes: [] });
        } else {
          var oldBn    = pf.basename;
          var dotIdx   = oldBn.indexOf('.');
          var prefix   = oldBn.substring(0, dotIdx);
          var rest     = oldBn.substring(dotIdx + 1);
          var slugPart = rest.split(' - ')[0];
          var newBn    = prefix + '.' + slugPart.toUpperCase() + '.' + rest;
          var newPath  = projFolder + '/' + newBn + '.md';
          if (!newPath.startsWith(projFolder + '/')) {
            opResults.push({ op: op, note: noteSearch, count: 0, error: 'path traversal rejected' });
          } else {
            if (!dryRun) {
              var captNP = newPath;
              await app.fileManager.processFrontMatter(pf, function(fmRef) {
                fmRef.type = 'BRANCH';
                if (!Array.isArray(fmRef.children)) fmRef.children = [];
                fmRef.modified = todayStr();
              });
              await app.fileManager.renameFile(pf, captNP);
            }
            notes.push(pf.path);
            opResults.push({ op: op, note: noteSearch, from: pf.path, to: newPath, count: 1, notes: notes });
          }
        }
      }
    }
  }

  var totalModified = opResults.reduce(function(s, r){ return s + (r.count || 0); }, 0);

  if (!dryRun && totalModified > 0) {
    var dailyPath = 'journals/daily/' + todayStr() + '.md';
    var dailyFile = app.vault.getAbstractFileByPath(dailyPath);
    if (dailyFile) {
      var opSummary = opResults.map(function(r) { return r.op + ':' + (r.count || 0); }).join(', ');
      await app.vault.append(dailyFile,
        '\\n## Migration Log\\n\\nProject: ' + projSlug + ' — ' + totalModified +
        ' notes modified (' + opSummary + ')\\n'
      );
    }
  }

  return JSON.stringify({ dryRun: dryRun, ops: opResults, totalModified: totalModified });
})()`;
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'migrate',
  description:
    'Apply bulk schema changes from a declarative JSON spec (rename-rel, rename-spine, add-field, promote)',

  async run(args: string[]): Promise<void> {
    let dryRun = false;
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];
    for (const a of rest) {
      if (a === '--dry-run') dryRun = true;
      else positional.push(a);
    }

    if (positional.length < 2) {
      process.stderr.write(
        'Usage: nerv migrate [--vault <name>] <project_slug> <spec_file> [--dry-run]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const slug = positional[0];
    const specPath = positional[1];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      process.stderr.write(
        `ERROR: migrate: project slug must be lowercase alphanumeric with hyphens (got: ${slug})\n`
      );
      process.exit(1);
    }

    // Read and parse spec
    let spec: MigrateOp[];
    try {
      spec = await Bun.file(specPath).json();
    } catch {
      process.stderr.write(`ERROR: migrate: spec file not found or invalid JSON: ${specPath}\n`);
      process.exit(1);
    }

    // Structural validation
    const validationErrors = validateSpec(spec);
    if (validationErrors.length > 0) {
      for (const err of validationErrors) {
        process.stderr.write(`ERROR: migrate: ${err}\n`);
      }
      process.exit(1);
    }

    // Run migration via Obsidian eval
    const raw = await obEval(vault, buildMigrateExpr(spec, slug, dryRun)).catch(() => '');
    if (!raw) {
      process.stderr.write('ERROR: migrate: Obsidian not reachable or eval failed\n');
      process.exit(1);
    }

    const data = parseJson<MigrateResult>(raw);
    if (!data) {
      process.stderr.write('ERROR: migrate: invalid JSON from eval\n');
      process.exit(1);
    }

    if (data.validationFailed) {
      for (const err of data.errors ?? []) {
        process.stderr.write(`ERROR: migrate: ${err}\n`);
      }
      process.exit(1);
    }

    // Print per-operation results
    for (const op of data.ops) {
      if (op.error) {
        process.stderr.write(`ERROR: migrate: ${op.op} — ${op.error}\n`);
        process.exit(1);
      }
      if (dryRun) {
        process.stdout.write(`Dry-run ${op.op}: ${op.count} note(s) would be modified\n`);
        if (op.notes.length > 0) {
          for (const n of op.notes) process.stdout.write(`  ${n}\n`);
        }
      } else {
        process.stdout.write(`Applied ${op.op} to ${op.count} note(s)\n`);
      }
    }

    const total = data.totalModified;
    if (dryRun) {
      process.stdout.write(`Dry-run complete: ${total} total note(s) would be modified\n`);
    } else {
      process.stdout.write(`Migration complete: ${total} total note(s) modified\n`);

      // Write rollback log if any changes were made
      if (total > 0) {
        const summary = `migrate ${slug}: ` + data.ops.map(r => `${r.op} ${r.count}`).join('; ');
        await rollbackLog(vault, `migrate ${slug}`, summary).catch(() => undefined);
      }
    }
  },
};

export default command;
