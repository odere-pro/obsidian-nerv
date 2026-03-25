#!/usr/bin/env bash
# create-entity.sh — Motor skill: create a typed note inside a project
#
# Usage:
#   create-entity.sh <vault> <project> <TYPE> <slug> "<Title>" <parent_slug> <kind> [<spine>] [--json]
#   create-entity.sh vault=<name> <project> <TYPE> <slug> "<Title>" <parent_slug> <kind> [<spine>] [--json]
#
# TYPE:        LEAF | BRANCH | ROOT
# parent_slug: slug portion of the parent note (e.g. ROOT, or branch-slug)
# spine:       optional; inherited from parent note's spine field when omitted
# --json:      emit {"created":bool,"path":"...","title":"..."} to stdout
#
# Example:
#   create-entity.sh study testproj LEAF test-leaf "Test Leaf" ROOT concept testproj
#
# STORY-006 — Implement create-entity.sh motor skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Arg parsing — strip --json flag before positional assignment
# ---------------------------------------------------------------------------
JSON_OUTPUT=false
_ARGS=()
for _a in "$@"; do
  if [[ "$_a" == "--json" ]]; then
    JSON_OUTPUT=true
  else
    _ARGS+=("$_a")
  fi
done

if [[ ${#_ARGS[@]} -lt 7 ]]; then
  printf 'Usage: %s <vault> <project> <TYPE> <slug> "<Title>" <parent_slug> <kind> [<spine>] [--json]\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT_ARG="${_ARGS[0]}"
PROJECT_SLUG="${_ARGS[1]}"
TYPE="${_ARGS[2]}"
ENTITY_SLUG="${_ARGS[3]}"
TITLE="${_ARGS[4]}"
PARENT_SLUG="${_ARGS[5]}"
KIND="${_ARGS[6]}"
SPINE="${_ARGS[7]:-}"  # optional; inherited from parent when empty

VAULT="$(resolve_vault "$VAULT_ARG")"

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
case "$TYPE" in
  LEAF|BRANCH|ROOT) ;;
  *) log_error "create-entity: TYPE must be LEAF, BRANCH, or ROOT (got: $TYPE)" ;;
esac

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "create-entity: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

if [[ ! "$ENTITY_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "create-entity: entity slug must be lowercase alphanumeric with hyphens (got: $ENTITY_SLUG)"
fi

# ---------------------------------------------------------------------------
# Derived values
# ---------------------------------------------------------------------------
PROJECT_UPPER="$(printf '%s' "$PROJECT_SLUG" | tr '[:lower:]' '[:upper:]')"
TODAY="$(date '+%Y-%m-%d')"

PROJ_DIR="projects/${PROJECT_SLUG}"
ENTITY_BASENAME="${PROJECT_UPPER}.${ENTITY_SLUG} - ${TITLE}"
ENTITY_PATH="${PROJ_DIR}/${ENTITY_BASENAME}.md"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

emit_json_result() {
  local created="$1" path="$2" title="$3" error="${4:-}"
  if [[ -n "$error" ]]; then
    emit_json "{\"created\":false,\"error\":$(json_str "$error")}"
  else
    emit_json "{\"created\":${created},\"path\":$(json_str "$path"),\"title\":$(json_str "$title")}"
  fi
}

fail() {
  local msg="$1"
  if $JSON_OUTPUT; then emit_json_result "false" "" "" "$msg"; fi
  printf 'ERROR: %s\n' "$msg" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Idempotency check
# ---------------------------------------------------------------------------
js_entity_path="$(json_str "$ENTITY_PATH")"
existing="$(ob_eval "$VAULT" \
  "app.vault.getAbstractFileByPath(${js_entity_path}) ? 'exists' : 'absent'" \
  2>/dev/null)" || existing="absent"

if [[ "$existing" == "exists" ]]; then
  if $JSON_OUTPUT; then
    emit_json_result "false" "$ENTITY_PATH" "$TITLE"
  else
    printf 'INFO: entity "%s" already exists — no changes made\n' "$ENTITY_SLUG"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Find parent note and read spine
# ---------------------------------------------------------------------------
js_proj_dir="$(json_str "$PROJ_DIR")"
js_parent_prefix="$(json_str "${PROJECT_UPPER}.${PARENT_SLUG} - ")"

parent_info="$(ob_eval "$VAULT" "(async () => {
  const projDir = ${js_proj_dir};
  const prefix = ${js_parent_prefix};
  const f = app.vault.getFiles().find(function(f) {
    return f.path.startsWith(projDir + '/') && f.name.startsWith(prefix);
  });
  if (!f) return 'NOT_FOUND';
  const meta = app.metadataCache.getFileCache(f);
  const spine = (meta && meta.frontmatter && meta.frontmatter.spine)
    ? meta.frontmatter.spine : '';
  return JSON.stringify({basename: f.basename, spine: spine});
})()" 2>/dev/null)" || parent_info="NOT_FOUND"

if [[ "$parent_info" == "NOT_FOUND" || -z "$parent_info" ]]; then
  fail "parent note '${PROJECT_UPPER}.${PARENT_SLUG} - *' not found in ${PROJ_DIR}"
fi

parent_basename="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d['basename'])" "$parent_info")"
parent_spine="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d['spine'])" "$parent_info")"

# Spine inheritance: use parent's spine when not explicitly supplied
[[ -z "$SPINE" && -n "$parent_spine" ]] && SPINE="$parent_spine"
[[ -z "$SPINE" ]] && SPINE="$PROJECT_SLUG"

# ---------------------------------------------------------------------------
# Build entity file content
# ---------------------------------------------------------------------------
PARENT_LINK="[[${parent_basename}]]"
ENTITY_LINK="[[${ENTITY_BASENAME}]]"

# Body sections depend on entity type
if [[ "$TYPE" == "ROOT" ]]; then
  BODY="## Summary

## Map

## Connections

## Flags"
else
  BODY="## Breadcrumb

## Summary

## Content

## Connections

## Flags"
fi

ENTITY_CONTENT="---
title: \"${TITLE}\"
aliases: []
type: ${TYPE}
kind: ${KIND}
spine: ${SPINE}
status: draft
parent: \"${PARENT_LINK}\"
children: []
attachments: []
created: ${TODAY}
modified: ${TODAY}
---

${BODY}
"

# ---------------------------------------------------------------------------
# Create entity file
# ---------------------------------------------------------------------------
js_entity_content="$(json_str "$ENTITY_CONTENT")"
create_result="$(ob_eval "$VAULT" \
  "(async () => { await app.vault.create(${js_entity_path}, ${js_entity_content}); return 'ok'; })()" \
  2>/dev/null)" || create_result="error"

if [[ "$create_result" != "ok" ]]; then
  rollback_log "$VAULT" "create-entity" \
    "file creation failed: ${ENTITY_PATH}" > /dev/null 2>&1 || true
  fail "file creation failed for ${ENTITY_PATH}"
fi

# ---------------------------------------------------------------------------
# Update parent's children array via processFrontMatter
# ---------------------------------------------------------------------------
js_parent_basename="$(json_str "$parent_basename")"
js_entity_link="$(json_str "$ENTITY_LINK")"

update_result="$(ob_eval "$VAULT" "(async () => {
  const parentFile = app.vault.getFiles().find(function(f) {
    return f.basename === ${js_parent_basename};
  });
  if (!parentFile) return 'NOT_FOUND';
  await app.fileManager.processFrontMatter(parentFile, function(fm) {
    if (!Array.isArray(fm.children)) fm.children = [];
    if (!fm.children.includes(${js_entity_link})) fm.children.push(${js_entity_link});
  });
  return 'ok';
})()" 2>/dev/null)" || update_result="error"

if [[ "$update_result" != "ok" ]]; then
  rollback_log "$VAULT" "create-entity" \
    "entity created at ${ENTITY_PATH} but parent children update failed (parent: ${parent_basename})" \
    > /dev/null 2>&1 || true
  fail "parent children update failed; entity was created at ${ENTITY_PATH}"
fi

# ---------------------------------------------------------------------------
# Log creation to daily note (best-effort)
# ---------------------------------------------------------------------------
daily_append "$VAULT" "- Created ${ENTITY_LINK}" > /dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if $JSON_OUTPUT; then
  emit_json_result "true" "$ENTITY_PATH" "$TITLE"
else
  printf 'INFO: created %s\n' "$ENTITY_PATH"
fi

exit 0
