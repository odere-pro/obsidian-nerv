#!/usr/bin/env bash
# import-json.sh — Motor skill: bulk-create notes from a JSON array
#
# Usage:
#   import-json.sh <vault|vault=name> <project_slug> <json_file> <template>
#
# JSON format:
#   [{"name":"NoteTitle","type":"LEAF","kind":"concept","spine":"slug",...extra}]
#
# Standard schema fields: name, type, kind, spine.
# All other fields are treated as extras and written via processFrontMatter.
# Skips notes that already exist; reports "Created: N, Skipped: M".
#
# STORY-008 — Implement import-json.sh and document CRUD patterns
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 4 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> <json_file> <template>\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
SLUG="$2"
JSON_FILE="$3"
TEMPLATE="$4"

# Validate slug: lowercase alphanumeric with optional hyphens, starts with alphanumeric.
# Rejects path traversal (/, .., spaces, etc.).
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "import-json: project slug must be lowercase alphanumeric with optional hyphens (got: $SLUG)"
fi

# Validate JSON file exists
[[ -f "$JSON_FILE" ]] || log_error "import-json: JSON file not found: $JSON_FILE"

SLUG_UPPER="$(printf '%s' "$SLUG" | tr '[:lower:]' '[:upper:]')"
TODAY="$(date '+%Y-%m-%d')"
PROJ_DIR="projects/${SLUG}"

# ---------------------------------------------------------------------------
# Helper: JSON-encode a string for safe embedding in JS expressions.
# Prevents shell-injection when user-supplied values are embedded in JS.
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

# ---------------------------------------------------------------------------
# Verify the project directory exists in the vault
# ---------------------------------------------------------------------------
js_proj_dir="$(json_str "$PROJ_DIR")"
proj_exists="$(ob_eval "$VAULT" \
  "app.vault.getAbstractFileByPath(${js_proj_dir}) ? 'exists' : 'absent'" \
  2>/dev/null)" || proj_exists="absent"

if [[ "$proj_exists" != "exists" ]]; then
  log_error "import-json: project '${SLUG}' not found in vault ${VAULT}. Run create-project.sh first."
fi

# ---------------------------------------------------------------------------
# Parse the entire JSON array with python3 — one JSON object per output line.
# Avoids spawning a Python process per note (recommendation from STORY-008).
# ---------------------------------------------------------------------------
NOTES_JSON="$(python3 -c "
import json, sys

with open(sys.argv[1]) as fh:
    data = json.load(fh)

if not isinstance(data, list):
    print('ERROR: JSON root must be an array', file=sys.stderr)
    sys.exit(1)

for note in data:
    if isinstance(note, dict):
        print(json.dumps(note))
" "$JSON_FILE")" || log_error "import-json: failed to parse JSON file: $JSON_FILE"

CREATED=0
SKIPPED=0

# ---------------------------------------------------------------------------
# Process each note (one JSON object per line)
# ---------------------------------------------------------------------------
while IFS= read -r note_json; do
  [[ -z "$note_json" ]] && continue

  # Extract standard fields via python3 — safe against quoting issues
  NOTE_NAME="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('name',''))" "$note_json")"
  NOTE_TYPE="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('type','LEAF'))" "$note_json")"
  NOTE_KIND="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('kind','concept'))" "$note_json")"
  NOTE_SPINE="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('spine',''))" "$note_json")"

  if [[ -z "$NOTE_NAME" ]]; then
    printf 'WARN: skipping note with missing name field\n' >&2
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Derive note slug: lowercase, keep only alphanumeric characters.
  # e.g. "TestImport" → "testimport", "My Note" → "mynote"
  NOTE_SLUG="$(printf '%s' "$NOTE_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"

  if [[ -z "$NOTE_SLUG" ]]; then
    printf 'WARN: skipping note "%s" — slug is empty after sanitisation\n' "$NOTE_NAME" >&2
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Construct vault-relative path and validate it stays within the project folder.
  # Path-traversal guard: NOTE_SLUG is already stripped to [a-z0-9] above.
  NOTE_PATH="${PROJ_DIR}/${SLUG_UPPER}.${NOTE_SLUG} - ${NOTE_NAME}.md"

  # Idempotency check — skip without error if note already exists
  js_note_path="$(json_str "$NOTE_PATH")"
  existing="$(ob_eval "$VAULT" \
    "app.vault.getAbstractFileByPath(${js_note_path}) ? 'exists' : 'absent'" \
    2>/dev/null)" || existing="absent"

  if [[ "$existing" == "exists" ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Build initial note content with standard frontmatter.
  # Body sections follow the leaf/branch template structure.
  NOTE_CONTENT="---
title: \"${NOTE_NAME}\"
aliases: []
type: ${NOTE_TYPE}
kind: ${NOTE_KIND}
spine: ${NOTE_SPINE}
status: draft
parent: \"\"
children: []
attachments: []
created: ${TODAY}
modified: ${TODAY}
---

## Breadcrumb

## Summary

## Content

## Connections

## Flags
"

  # Create the note via the Obsidian vault API
  js_note_content="$(json_str "$NOTE_CONTENT")"
  if ! ob_eval "$VAULT" \
    "(async () => { await app.vault.create(${js_note_path}, ${js_note_content}); })()" \
    > /dev/null; then
    printf 'ERROR: failed to create note: %s\n' "$NOTE_PATH" >&2
    continue
  fi

  # Pass extra properties (everything beyond standard schema) via processFrontMatter.
  # JSON-encode the extras string so JSON.parse in JS reconstructs the object safely,
  # preventing any JS injection from field names or values.
  EXTRA_JSON="$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
standard = {'name', 'type', 'kind', 'spine'}
extras = {k: v for k, v in d.items() if k not in standard}
print(json.dumps(extras))
" "$note_json")"

  if [[ "$EXTRA_JSON" != "{}" ]]; then
    js_extras="$(json_str "$EXTRA_JSON")"
    ob_eval "$VAULT" "(async () => {
      const f = app.vault.getAbstractFileByPath(${js_note_path});
      if (f) {
        const extras = JSON.parse(${js_extras});
        await app.fileManager.processFrontMatter(f, fm => {
          Object.assign(fm, extras);
        });
      }
    })()" > /dev/null || true
  fi

  CREATED=$((CREATED + 1))
done <<< "$NOTES_JSON"

printf 'Created: %d, Skipped: %d\n' "$CREATED" "$SKIPPED"
exit 0
