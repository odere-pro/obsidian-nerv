#!/usr/bin/env bash
# create-project.sh — Motor skill: scaffold a new project in <vault>
#
# Usage:
#   create-project.sh <vault> <slug> "<Title>"
#   create-project.sh vault=<name> <slug> "<Title>"
#
# Creates exactly 5 files under projects/<slug>/:
#   <SLUG>.ROOT - <Title>.md
#   _ontology.<slug>.md
#   _vocab.<slug>.md
#   _topk.<slug>.md
#   <slug>.base
#
# STORY-005 — Implement create-project.sh motor skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 3 ]]; then
  printf 'Usage: %s <vault|vault=name> <slug> "<Title>"\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
SLUG="$2"
TITLE="$3"

# Validate slug: lowercase alphanumeric and hyphens, must start with alphanumeric.
# Path-traversal guard: reject anything with / .. or non-slug characters.
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "create-project: slug must be lowercase alphanumeric with optional hyphens (got: $SLUG)"
fi

SLUG_UPPER="$(printf '%s' "$SLUG" | tr '[:lower:]' '[:upper:]')"
TODAY="$(date '+%Y-%m-%d')"

PROJ_DIR="projects/${SLUG}"
ROOT_PATH="${PROJ_DIR}/${SLUG_UPPER}.ROOT - ${TITLE}.md"
ONTO_PATH="${PROJ_DIR}/_ontology.${SLUG}.md"
VOCAB_PATH="${PROJ_DIR}/_vocab.${SLUG}.md"
TOPK_PATH="${PROJ_DIR}/_topk.${SLUG}.md"
BASE_PATH="${PROJ_DIR}/${SLUG}.base"

# ---------------------------------------------------------------------------
# Helper: JSON-encode a string for safe embedding in JS
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

# ---------------------------------------------------------------------------
# Idempotency check — exit 0 without modification if ROOT already exists
# ---------------------------------------------------------------------------
js_root_path="$(json_str "$ROOT_PATH")"
existing="$(ob_eval "$VAULT" \
  "app.vault.getAbstractFileByPath(${js_root_path}) ? 'exists' : 'absent'" \
  2>/dev/null)" || existing="absent"

if [[ "$existing" == "exists" ]]; then
  printf 'INFO: project "%s" already exists in vault %s — no changes made\n' "$SLUG" "$VAULT"
  exit 0
fi

# ---------------------------------------------------------------------------
# File contents
# ---------------------------------------------------------------------------
ROOT_CONTENT="---
title: \"${TITLE}\"
aliases: []
type: ROOT
kind: concept
spine: ${SLUG}
status: draft
parent: \"\"
children: []
attachments: []
created: ${TODAY}
modified: ${TODAY}
---

## Summary

## Map

## Connections

## Flags
"

ONTO_CONTENT="---
type: ONTOLOGY
project: ${SLUG}
updated: ${TODAY}
---

## Relationship Types

| Type | Inverse | Symmetric | Description |
|------|---------|-----------|-------------|
| \`triggers\` | \`triggered-by\` | false | A causes B to occur |
| \`depends-on\` | \`depended-by\` | false | A requires B to function |
| \`implements\` | \`implemented-by\` | false | A is a concrete realisation of abstract concept B |
| \`extends\` | \`extended-by\` | false | A adds to or specialises B |
| \`compares-to\` | \`compares-to\` | true | A and B are analysed side-by-side |
| \`replaces\` | \`replaced-by\` | false | A supersedes B |
| \`feeds-data\` | \`fed-by\` | false | A supplies data to B |
| \`authenticates-via\` | \`authenticates\` | false | A uses B for authentication |
| \`contains\` | \`contained-by\` | false | A is the parent container of B |
| \`mitigates\` | \`mitigated-by\` | false | A reduces risk posed by B |
"

VOCAB_CONTENT="---
type: VOCAB
project: ${SLUG}
updated: ${TODAY}
---

## L0 — Spine Roots

## L1 — Primary Branches

## L2 — Secondary Branches

## L3 — Leaves

## Shared Terms

## Orphan Terms
"

TOPK_CONTENT="---
type: TOPK
project: ${SLUG}
updated: ${TODAY}
---

## Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Connections per note | 7 | Prevents over-linking; forces pruning |
| Callout flags per note | 3 | Keeps flags scannable |
| BRANCH children | 7 | Keeps tree manageable |
| LEAF children | 5 | LEAF nodes should not branch deeply |

## Overflow Log

| Date | Note | Field | Count | Action |
|------|------|-------|-------|--------|

## Split History

| Date | Original | Split Into | Reason |
|------|----------|------------|--------|
"

BASE_CONTENT="filters:
  - file.inFolder(\"projects/${SLUG}\")
formulas:
  status_icon: 'if(status == \"published\", \"✅\", if(status == \"review\", \"🔍\", if(status == \"draft\", \"📝\", \"⬜\")))'
  last_updated: 'modified'
  link_count: 'file.outlinks.length'
views:
  - type: table
    name: All Notes
    order:
      - file.name
      - formula.status_icon
      - type
      - kind
      - spine
      - created
      - formula.last_updated
  - type: table
    name: Drafts
    filters:
      and:
        - 'status == \"draft\"'
    order:
      - file.name
      - type
      - kind
      - created
  - type: table
    name: Browse
    order:
      - file.name
      - type
      - kind
      - formula.link_count
      - formula.last_updated
"

# ---------------------------------------------------------------------------
# Helper: create a single vault file via Obsidian JS API
# ---------------------------------------------------------------------------
ob_create_file() {
  local path="$1" content="$2"
  local js_path js_content
  js_path="$(json_str "$path")"
  js_content="$(json_str "$content")"
  ob_eval "$VAULT" "(async () => { await app.vault.create(${js_path}, ${js_content}); })()" > /dev/null
}

# ---------------------------------------------------------------------------
# Create project folder
# ---------------------------------------------------------------------------
js_proj_dir="$(json_str "$PROJ_DIR")"
ob_eval "$VAULT" "(async () => {
  const exists = app.vault.getAbstractFileByPath(${js_proj_dir});
  if (!exists) await app.vault.createFolder(${js_proj_dir});
})()" > /dev/null

# ---------------------------------------------------------------------------
# Create the 5 project files — ordered ROOT → ontology → vocab → topk → base.
# On any failure after ROOT is created, record partial state in rollback log.
# ---------------------------------------------------------------------------
ob_create_file "$ROOT_PATH" "$ROOT_CONTENT" \
  || { rollback_log "$VAULT" "create-project" \
         "folder created: ${PROJ_DIR}; ROOT creation failed"; exit 1; }

ob_create_file "$ONTO_PATH" "$ONTO_CONTENT" \
  || { rollback_log "$VAULT" "create-project" \
         "created ROOT; _ontology creation failed for ${SLUG}"; exit 1; }

ob_create_file "$VOCAB_PATH" "$VOCAB_CONTENT" \
  || { rollback_log "$VAULT" "create-project" \
         "created ROOT _ontology; _vocab creation failed for ${SLUG}"; exit 1; }

ob_create_file "$TOPK_PATH" "$TOPK_CONTENT" \
  || { rollback_log "$VAULT" "create-project" \
         "created ROOT _ontology _vocab; _topk creation failed for ${SLUG}"; exit 1; }

ob_create_file "$BASE_PATH" "$BASE_CONTENT" \
  || { rollback_log "$VAULT" "create-project" \
         "created ROOT _ontology _vocab _topk; .base creation failed for ${SLUG}"; exit 1; }

printf 'INFO: project "%s" created in vault %s\n' "$SLUG" "$VAULT"
printf '  %s\n' "$ROOT_PATH" "$ONTO_PATH" "$VOCAB_PATH" "$TOPK_PATH" "$BASE_PATH"
exit 0
