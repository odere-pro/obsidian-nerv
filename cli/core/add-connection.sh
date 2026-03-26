#!/usr/bin/env bash
# add-connection.sh — Motor skill: write a typed bidirectional connection
#
# Usage:
#   add-connection.sh <vault> <source_path> <rel_type> <target_path> [<context>]
#   add-connection.sh vault=<name> <source_path> <rel_type> <target_path> [<context>]
#
# Writes "- <rel_type> :: [[<target_alias>]] — <context>" to source note's
# ## Connections section and derives + writes the inverse to the target note.
# Inverse type is looked up from the project's _ontology.<slug>.md table.
#
# Idempotent: if the exact wikilink already exists in the section, no write.
# Enforces 7-connection limit per note.
# Symmetric relationships (Symmetric column = "yes") use the same type as inverse.
#
# Exit codes: 0 success; 1 error.
#
# STORY-007 — Implement add-connection.sh motor skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 4 ]]; then
  printf 'Usage: %s <vault|vault=name> <source_path> <rel_type> <target_path> [<context>]\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
SOURCE_PATH="$2"
REL_TYPE="$3"
TARGET_PATH="$4"
CONTEXT="${5:-}"

# Strip newlines from context to prevent injection
CONTEXT="$(printf '%s' "$CONTEXT" | tr -d '\n\r')"

if [[ ! "$REL_TYPE" =~ ^[a-z][a-z0-9-]*$ ]]; then
  printf 'ERROR: add-connection: rel_type must be lowercase alphanumeric with hyphens (got: %s)\n' \
    "$REL_TYPE" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

# ---------------------------------------------------------------------------
# Derive project slug from source path (projects/<slug>/...)
# ---------------------------------------------------------------------------
PROJECT_SLUG="$(printf '%s' "$SOURCE_PATH" | sed 's|projects/\([^/]*\)/.*|\1|')"
if [[ -z "$PROJECT_SLUG" || "$PROJECT_SLUG" == "$SOURCE_PATH" ]]; then
  printf 'ERROR: add-connection: cannot derive project slug from path: %s\n' "$SOURCE_PATH" >&2
  exit 1
fi

ONTOLOGY_PATH="projects/${PROJECT_SLUG}/_ontology.${PROJECT_SLUG}.md"

# ---------------------------------------------------------------------------
# Look up inverse and symmetric flag from _ontology table via Obsidian eval
# ---------------------------------------------------------------------------
js_ontology_path="$(json_str "$ONTOLOGY_PATH")"
js_rel_type="$(json_str "$REL_TYPE")"

# shellcheck disable=SC2016
LOOKUP_JS=$(cat <<'JSEOF'
(async () => {
  var ontPath = __ONTOLOGY_PATH__;
  var relType = __REL_TYPE__;
  var f = app.vault.getAbstractFileByPath(ontPath);
  if (!f) return JSON.stringify({error: 'ontology not found: ' + ontPath});
  var body = await app.vault.cachedRead(f);
  var lines = body.split('\n');
  var inverse = '';
  var symmetric = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.charAt(0) !== '|') continue;
    // table: | type | description | inverse | symmetric |
    var cols = line.split('|').map(function(c) { return c.trim().replace(/\x60/g, ''); });
    if (cols[1] === relType) {
      inverse   = cols[3] || '';
      symmetric = (cols[4] || '').toLowerCase() === 'yes';
      break;
    }
  }
  return JSON.stringify({inverse: inverse, symmetric: symmetric});
})()
JSEOF
)
LOOKUP_JS="${LOOKUP_JS/__ONTOLOGY_PATH__/${js_ontology_path}}"
LOOKUP_JS="${LOOKUP_JS/__REL_TYPE__/${js_rel_type}}"

lookup_result="$(ob_eval "$VAULT" "$LOOKUP_JS" 2>/dev/null)" || lookup_result=''

if [[ -z "$lookup_result" ]]; then
  printf 'WARN: add-connection: could not read ontology; inverse will be skipped\n' >&2
  INVERSE_TYPE=""
  SYMMETRIC=false
else
  error_msg="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('error',''))" \
    "$lookup_result" 2>/dev/null || echo '')"
  if [[ -n "$error_msg" ]]; then
    printf 'WARN: add-connection: %s; inverse will be skipped\n' "$error_msg" >&2
    INVERSE_TYPE=""
    SYMMETRIC=false
  else
    INVERSE_TYPE="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('inverse',''))" \
      "$lookup_result")"
    SYMMETRIC="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print('true' if d.get('symmetric') else 'false')" \
      "$lookup_result")"
  fi
fi

# Unknown relationship type: warn but continue (STORY-007 spec)
if [[ -z "$INVERSE_TYPE" && "$SYMMETRIC" == "false" ]]; then
  printf 'WARN: add-connection: unknown relationship type "%s" — inverse will not be written\n' \
    "$REL_TYPE" >&2
fi

# Symmetric: inverse type is the same as forward type
[[ "$SYMMETRIC" == "true" ]] && INVERSE_TYPE="$REL_TYPE"

# ---------------------------------------------------------------------------
# Write forward connection to source, then inverse to target (if known)
# ---------------------------------------------------------------------------
js_source_path="$(json_str "$SOURCE_PATH")"
js_target_path="$(json_str "$TARGET_PATH")"
js_context="$(json_str "$CONTEXT")"
js_inverse_type="$(json_str "$INVERSE_TYPE")"

# shellcheck disable=SC2016
WRITE_JS=$(cat <<'JSEOF'
(async () => {
  var sourcePath   = __SOURCE_PATH__;
  var targetPath   = __TARGET_PATH__;
  var relType      = __REL_TYPE__;
  var inverseType  = __INVERSE_TYPE__;
  var ctx          = __CONTEXT__;
  var LIMIT        = 7;

  function titleAlias(basename) {
    // Strip "PREFIX.slug - " prefix to get display title
    return basename.replace(/^[A-Z0-9]+\.[a-z0-9-]+ - /, '');
  }

  function connLine(type, targetBasename, context) {
    var alias = titleAlias(targetBasename);
    var link  = '[[' + targetBasename + '|' + alias + ']]';
    return '- ' + type + ' :: ' + link + (context ? ' \u2014 ' + context : '');
  }

  function countConnections(body) {
    var m = body.match(/^- [a-z][a-z0-9-]* :: \[\[/gm);
    return m ? m.length : 0;
  }

  function hasConnection(body, targetBasename) {
    return body.indexOf('[[' + targetBasename) !== -1;
  }

  function appendToConnections(body, line) {
    var idx = body.indexOf('\n## Connections');
    if (idx === -1) {
      idx = body.indexOf('## Connections');
    }
    if (idx === -1) return {content: body, error: 'no ## Connections section'};

    // Find end of connections section — stop at next ## heading or EOF
    var afterConn = body.indexOf('\n## ', idx + 1);
    var insertAt  = afterConn !== -1 ? afterConn : body.length;

    // Trim trailing whitespace from the section block
    var before = body.substring(0, insertAt).trimEnd();
    var after  = body.substring(insertAt);

    return {content: before + '\n' + line + '\n' + after, error: ''};
  }

  var sourceFile = app.vault.getAbstractFileByPath(sourcePath);
  if (!sourceFile) return JSON.stringify({error: 'source not found: ' + sourcePath});

  var targetFile = app.vault.getAbstractFileByPath(targetPath);
  if (!targetFile) return JSON.stringify({error: 'target not found: ' + targetPath});

  var forwardWritten = false;
  var inverseWritten = false;
  var forwardError   = '';
  var inverseError   = '';

  // Write forward connection
  await app.vault.process(sourceFile, function(body) {
    if (hasConnection(body, targetFile.basename)) {
      forwardWritten = 'skipped';
      return body;
    }
    var count = countConnections(body);
    if (count >= LIMIT) {
      forwardError = 'Connection limit (' + LIMIT + ') reached on ' + sourceFile.basename;
      return body;
    }
    var result = appendToConnections(body, connLine(relType, targetFile.basename, ctx));
    if (result.error) {
      forwardError = result.error;
      return body;
    }
    forwardWritten = true;
    return result.content;
  });

  if (forwardError) return JSON.stringify({error: forwardError});

  // Write inverse connection (best-effort; rollback logged if it fails)
  if (inverseType && targetFile) {
    await app.vault.process(targetFile, function(body) {
      if (hasConnection(body, sourceFile.basename)) {
        inverseWritten = 'skipped';
        return body;
      }
      var count = countConnections(body);
      if (count >= LIMIT) {
        inverseError = 'Connection limit (' + LIMIT + ') reached on ' + targetFile.basename;
        return body;
      }
      var invCtx = ctx ? 'inverse of: ' + ctx : '';
      var result = appendToConnections(body, connLine(inverseType, sourceFile.basename, invCtx));
      if (result.error) {
        inverseError = result.error;
        return body;
      }
      inverseWritten = true;
      return result.content;
    });
  }

  return JSON.stringify({
    forwardWritten: forwardWritten,
    inverseWritten: inverseWritten,
    inverseError:   inverseError
  });
})()
JSEOF
)
WRITE_JS="${WRITE_JS/__SOURCE_PATH__/${js_source_path}}"
WRITE_JS="${WRITE_JS/__TARGET_PATH__/${js_target_path}}"
WRITE_JS="${WRITE_JS/__REL_TYPE__/${js_rel_type}}"
WRITE_JS="${WRITE_JS/__INVERSE_TYPE__/${js_inverse_type}}"
WRITE_JS="${WRITE_JS/__CONTEXT__/${js_context}}"

write_result="$(ob_eval "$VAULT" "$WRITE_JS" 2>/dev/null)" || write_result=''

if [[ -z "$write_result" ]]; then
  printf 'ERROR: add-connection: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

python3 - "$write_result" "$SOURCE_PATH" "$TARGET_PATH" "$REL_TYPE" <<'PYEOF'
import json, sys

data        = json.loads(sys.argv[1])
source_path = sys.argv[2]
target_path = sys.argv[3]
rel_type    = sys.argv[4]

if data.get('error'):
    print('ERROR: add-connection: ' + data['error'], file=sys.stderr)
    sys.exit(1)

fw = data.get('forwardWritten')
iv = data.get('inverseWritten')
ie = data.get('inverseError', '')

if fw == 'skipped':
    print('INFO: forward connection already exists — skipped')
elif fw:
    print('INFO: wrote {} :: {} -> {}'.format(rel_type, source_path, target_path))

if iv == 'skipped':
    print('INFO: inverse connection already exists — skipped')
elif iv:
    print('INFO: wrote inverse connection')
elif ie:
    print('WARN: inverse not written: ' + ie, file=sys.stderr)
PYEOF
