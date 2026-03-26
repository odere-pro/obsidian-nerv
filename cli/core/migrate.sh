#!/usr/bin/env bash
# migrate.sh — Schema migration skill: apply bulk schema changes from a declarative spec
#
# Usage:
#   migrate.sh <vault> <project_slug> <spec_file> [--dry-run]
#   migrate.sh vault=<name> <project_slug> <spec_file> [--dry-run]
#
# Spec format (JSON array of operations, applied in order):
#   [
#     {"op":"rename-rel",   "from":"triggers",  "to":"activates"},
#     {"op":"rename-spine", "from":"aws",        "to":"cloud"},
#     {"op":"add-field",    "field":"reviewed",  "value":false, "filter":{"type":"LEAF"}},
#     {"op":"promote",      "note":"PREFIX.leaf-slug"}
#   ]
#
# Supported operations:
#   rename-rel    Rename a relationship type in all ## Connections sections and _ontology
#   rename-spine  Update spine frontmatter on all matching notes and _vocab
#   add-field     Add a frontmatter field with a default value to notes matching a filter
#   promote       Change a LEAF to BRANCH: update type, add children:[], rename file
#
# Flags:
#   --dry-run     Report what would change without modifying any files
#
# Log lines emitted per operation:
#   Applied <op> to N notes
#   Dry-run <op>: N notes would be modified
#
# Exit codes: 0 success (including 0 notes modified); 1 validation error or runtime error.
#
# STORY-024 — Implement migrate.sh schema migration skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Arg parsing — strip --dry-run before positional assignment
# ---------------------------------------------------------------------------
DRY_RUN=false
_ARGS=()
for _a in "$@"; do
  [[ "$_a" == "--dry-run" ]] && DRY_RUN=true || _ARGS+=("$_a")
done

if [[ ${#_ARGS[@]} -lt 3 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> <spec_file> [--dry-run]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "${_ARGS[0]}")"
PROJECT_SLUG="${_ARGS[1]}"
SPEC_FILE="${_ARGS[2]}"

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf 'ERROR: migrate: project slug must be lowercase alphanumeric with hyphens (got: %s)\n' \
    "$PROJECT_SLUG" >&2
  exit 1
fi

if [[ ! -f "$SPEC_FILE" ]]; then
  printf 'ERROR: migrate: spec file not found: %s\n' "$SPEC_FILE" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Structural validation of spec — Python (fast, no Obsidian needed)
# ---------------------------------------------------------------------------
python3 - "$SPEC_FILE" <<'PYEOF' || exit 1
import json, sys, re

path = sys.argv[1]
try:
    with open(path) as fh:
        spec = json.load(fh)
except Exception as e:
    sys.stderr.write('ERROR: migrate: spec file is not valid JSON: {}\n'.format(e))
    sys.exit(1)

if not isinstance(spec, list) or len(spec) == 0:
    sys.stderr.write('ERROR: migrate: spec must be a non-empty JSON array\n')
    sys.exit(1)

VALID_OPS = {'rename-rel', 'rename-spine', 'add-field', 'promote'}
REQUIRED = {
    'rename-rel':   ['from', 'to'],
    'rename-spine': ['from', 'to'],
    'add-field':    ['field', 'value'],
    'promote':      ['note'],
}

errors = []
for i, op_def in enumerate(spec):
    if not isinstance(op_def, dict):
        errors.append('spec[{}]: each operation must be a JSON object'.format(i))
        continue
    op = op_def.get('op', '')
    if op not in VALID_OPS:
        errors.append('spec[{}]: "op" must be one of {} (got: {!r})'.format(
            i, sorted(VALID_OPS), op))
        continue
    for req in REQUIRED[op]:
        if req not in op_def:
            errors.append('spec[{}] ({}): missing required field "{}"'.format(i, op, req))
    if op == 'add-field':
        field = op_def.get('field', '')
        if not isinstance(field, str) or not re.match(r'^[a-zA-Z_][a-zA-Z0-9_-]*$', field):
            errors.append('spec[{}] (add-field): "field" must be a simple identifier (got: {!r})'.format(i, field))
        if op_def.get('field') == 'position':
            errors.append('spec[{}] (add-field): "position" is a reserved Obsidian field'.format(i))

if errors:
    for err in errors:
        sys.stderr.write('ERROR: migrate: {}\n'.format(err))
    sys.exit(1)
PYEOF

# ---------------------------------------------------------------------------
# JSON-encode inputs for safe embedding in JS
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

# Encode the spec file contents as a JS string (will be JSON.parse'd in JS)
js_spec="$(python3 -c "import json,sys; print(json.dumps(open(sys.argv[1]).read()))" "$SPEC_FILE")"
js_slug="$(json_str "$PROJECT_SLUG")"
js_dry_run="$( [[ "$DRY_RUN" == true ]] && echo 'true' || echo 'false' )"

# ---------------------------------------------------------------------------
# Migration IIFE — single eval call for atomicity
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
MIGRATE_JS=$(cat <<'JSEOF'
(async () => {
  var spec     = JSON.parse(__SPEC__);
  var projSlug = __SLUG__;
  var dryRun   = __DRY_RUN__;

  var projFolder = 'projects/' + projSlug;
  var allFiles   = app.vault.getMarkdownFiles();
  var projFiles  = allFiles.filter(function(f){
    return f.path.startsWith(projFolder + '/');
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  var escRe = function(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  var findArtifact = function(prefix) {
    return projFiles.find(function(f){
      return f.basename === '_' + prefix + '.' + projSlug;
    }) || null;
  };

  var todayStr = function() {
    return new Date().toISOString().split('T')[0];
  };

  // -------------------------------------------------------------------------
  // Pre-flight validation (all operations checked before any modification)
  // -------------------------------------------------------------------------
  var errors    = [];
  var ontFile   = findArtifact('ontology');
  var vocabFile = findArtifact('vocab');

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
      if (!new RegExp('`' + fromEscV + '`').test(ontBody)) {
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

    } else if (vop === 'add-field') {
      // Value validated structurally by Python; nothing more to check semantically.

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
      // Note already BRANCH → idempotent, not an error
    }
  }

  if (errors.length > 0) {
    return JSON.stringify({ validationFailed: true, errors: errors });
  }

  // -------------------------------------------------------------------------
  // Execute operations in order
  // -------------------------------------------------------------------------
  var opResults = [];

  for (var oi = 0; oi < spec.length; oi++) {
    var sop   = spec[oi];
    var op    = sop.op;
    var count = 0;
    var notes = [];

    // -----------------------------------------------------------------------
    // rename-rel: update ## Connections in all project notes + _ontology
    // -----------------------------------------------------------------------
    if (op === 'rename-rel') {
      var fromRel  = sop.from;
      var toRel    = sop.to;
      var fromEscR = escRe(fromRel);

      for (var fi = 0; fi < projFiles.length; fi++) {
        var f = projFiles[fi];
        if (f.basename.startsWith('_')) continue;  // skip meta-notes
        var body = await app.vault.cachedRead(f);
        if (!new RegExp('^(- )' + fromEscR + '( :: \\[\\[)', 'gm').test(body)) continue;
        if (!dryRun) {
          var captFE = fromEscR; var captTo = toRel;
          await app.vault.process(f, function(content) {
            return content.replace(
              new RegExp('^(- )' + captFE + '( :: \\[\\[)', 'gm'),
              '$1' + captTo + '$2'
            );
          });
        }
        count++;
        notes.push(f.path);
      }

      // Update _ontology: rename `fromRel` → `toRel` in backtick notation (both columns)
      if (ontFile) {
        var ontBody2   = await app.vault.cachedRead(ontFile);
        var fromEscOnt = escRe(fromRel);
        if (new RegExp('`' + fromEscOnt + '`').test(ontBody2) && !dryRun) {
          var captFO = fromEscOnt; var captTO = toRel;
          await app.vault.process(ontFile, function(content) {
            return content.replace(new RegExp('`' + captFO + '`', 'g'), '`' + captTO + '`');
          });
          await app.fileManager.processFrontMatter(ontFile, function(fm) {
            fm.updated = todayStr();
          });
        }
      }

      opResults.push({ op: op, from: fromRel, to: toRel, count: count, notes: notes });

    // -----------------------------------------------------------------------
    // rename-spine: update spine frontmatter on all matching notes + _vocab
    // -----------------------------------------------------------------------
    } else if (op === 'rename-spine') {
      var fromSpine = sop.from;
      var toSpine   = sop.to;

      for (var fi = 0; fi < projFiles.length; fi++) {
        var f     = projFiles[fi];
        var fcache = app.metadataCache.getFileCache(f);
        var ffm    = (fcache && fcache.frontmatter) ? fcache.frontmatter : {};
        if (ffm.spine !== fromSpine) continue;
        if (!dryRun) {
          var captTS = toSpine;
          await app.fileManager.processFrontMatter(f, function(fmRef) {
            fmRef.spine = captTS;
          });
        }
        count++;
        notes.push(f.path);
      }

      // Update _vocab: replace all occurrences of the spine name
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

    // -----------------------------------------------------------------------
    // add-field: add frontmatter field (default value) to matching notes
    // -----------------------------------------------------------------------
    } else if (op === 'add-field') {
      var fieldName  = sop.field;
      var fieldValue = sop.value;
      var filter     = sop.filter || {};

      for (var fi = 0; fi < projFiles.length; fi++) {
        var f      = projFiles[fi];
        if (f.basename.startsWith('_')) continue;  // skip meta-notes
        var fcache = app.metadataCache.getFileCache(f);
        var ffm    = (fcache && fcache.frontmatter) ? fcache.frontmatter : {};

        // Apply filter conditions
        if (filter.type   && ffm.type   !== filter.type  ) continue;
        if (filter.spine  && ffm.spine  !== filter.spine ) continue;
        if (filter.kind   && ffm.kind   !== filter.kind  ) continue;
        if (filter.status && ffm.status !== filter.status) continue;

        // Idempotent: skip if field already present
        if (fieldName in ffm) continue;

        if (!dryRun) {
          var captFN = fieldName; var captFV = fieldValue;
          await app.fileManager.processFrontMatter(f, function(fmRef) {
            fmRef[captFN] = captFV;
          });
        }
        count++;
        notes.push(f.path);
      }

      opResults.push({ op: op, field: fieldName, value: fieldValue, count: count, notes: notes });

    // -----------------------------------------------------------------------
    // promote: LEAF → BRANCH, rename file to BRANCH convention
    // -----------------------------------------------------------------------
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
          // Already promoted — idempotent
          opResults.push({ op: op, note: noteSearch, from: pf.path, to: pf.path,
                           count: 0, notes: [] });
        } else {
          // Derive BRANCH path: PREFIX.SLUG_UPPER.slug - Title.md
          var oldBn    = pf.basename;
          var dotIdx   = oldBn.indexOf('.');
          var prefix   = oldBn.substring(0, dotIdx);          // e.g. TESTMIG
          var rest     = oldBn.substring(dotIdx + 1);         // e.g. leaf-a - Leaf A
          var slugPart = rest.split(' - ')[0];                 // e.g. leaf-a
          var newBn    = prefix + '.' + slugPart.toUpperCase() + '.' + rest;
          var newPath  = projFolder + '/' + newBn + '.md';

          // Security: assert derived path stays within project folder
          if (!newPath.startsWith(projFolder + '/')) {
            opResults.push({ op: op, note: noteSearch, count: 0,
                             error: 'path traversal rejected' });
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
            count = 1;
            notes.push(pf.path);
            opResults.push({ op: op, note: noteSearch, from: pf.path,
                             to: newPath, count: 1, notes: notes });
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Post-migration (apply mode only): daily note append
  // -------------------------------------------------------------------------
  var totalModified = opResults.reduce(function(s, r){ return s + (r.count || 0); }, 0);

  if (!dryRun && totalModified > 0) {
    var dailyPath = 'journals/daily/' + todayStr() + '.md';
    var dailyFile = app.vault.getAbstractFileByPath(dailyPath);
    if (dailyFile) {
      var opSummary = opResults.map(function(r) {
        return r.op + ':' + (r.count || 0);
      }).join(', ');
      await app.vault.append(dailyFile,
        '\n## Migration Log\n\nProject: ' + projSlug + ' — ' + totalModified +
        ' notes modified (' + opSummary + ')\n'
      );
    }
  }

  return JSON.stringify({
    dryRun:        dryRun,
    ops:           opResults,
    totalModified: totalModified
  });
})()
JSEOF
)

MIGRATE_JS="${MIGRATE_JS/__SPEC__/${js_spec}}"
MIGRATE_JS="${MIGRATE_JS/__SLUG__/${js_slug}}"
MIGRATE_JS="${MIGRATE_JS/__DRY_RUN__/${js_dry_run}}"

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
result="$(ob_eval "$VAULT" "$MIGRATE_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: migrate: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Post-process result — print log lines, handle errors, rollback log
# ---------------------------------------------------------------------------
exit_code=0
rollback_needed=false
rollback_summary=''

python3 - "$result" "$PROJECT_SLUG" <<'PYEOF'
import json, sys

raw      = sys.argv[1]
proj     = sys.argv[2]

try:
    data = json.loads(raw)
except Exception as e:
    sys.stderr.write('ERROR: migrate: invalid JSON from eval: {}\n'.format(e))
    sys.exit(1)

if data.get('validationFailed'):
    for err in data.get('errors', []):
        sys.stderr.write('ERROR: migrate: {}\n'.format(err))
    sys.exit(1)

dry_run = data.get('dryRun', False)
total   = data.get('totalModified', 0)

for op_res in data.get('ops', []):
    op    = op_res.get('op', '?')
    count = op_res.get('count', 0)
    if op_res.get('error'):
        sys.stderr.write('ERROR: migrate: {} — {}\n'.format(op, op_res['error']))
        sys.exit(1)
    if dry_run:
        print('Dry-run {}: {} note(s) would be modified'.format(op, count))
    else:
        print('Applied {} to {} note(s)'.format(op, count))

if dry_run:
    print('Dry-run complete: {} total note(s) would be modified'.format(total))
else:
    print('Migration complete: {} total note(s) modified'.format(total))

# Signal to bash whether rollback logging is needed
PYEOF
exit_code=$?

if [[ $exit_code -ne 0 ]]; then
  exit $exit_code
fi

# ---------------------------------------------------------------------------
# Rollback log entry (apply mode, changes made)
# ---------------------------------------------------------------------------
if printf '%s' "$result" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read())
sys.exit(0 if not d.get('dryRun') and d.get('totalModified',0) > 0 else 1)
" 2>/dev/null; then
  rollback_summary="$(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
parts=['{} {}'.format(r.get('op'),r.get('count',0)) for r in d.get('ops',[])]
print('migrate.sh ' + sys.argv[2] + ': ' + '; '.join(parts))
" "$result" "$PROJECT_SLUG" 2>/dev/null)"
  rollback_log "$VAULT" "migrate.sh ${PROJECT_SLUG}" "$rollback_summary" 2>/dev/null || true
fi

exit 0
