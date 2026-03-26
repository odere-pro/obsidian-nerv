#!/usr/bin/env bash
# weekly-review.sh — Orchestration skill: run full vault health review
#
# Usage:
#   weekly-review.sh <vault> <project_slug> [--json]
#   weekly-review.sh vault=<name> <project_slug> [--json]
#
# Runs in sequence:
#   cli-lint → cli-orphans → cli-relations → sync-ontology → sync-vocab → sync-topk
#   → obsidian tags (step 7) → obsidian unresolved (step 8)
#
# Steps 7–8 use direct CLI commands (STORY-027 decision boundary).
# Falls back gracefully if the command is unavailable.
#
# Then appends a timestamped summary to today's daily note under
# ## Ontology Work Log.
#
# Exits 0 when all sub-commands exit 0.
# Exits 1 with failing command name on stderr when any sub-command fails.
#
# JSON schema (--json):
#   {"lint":{"issues":N},"orphans":{"issues":N},"relations":{"unknown":N},
#    "ontology":{"missingInverses":N},
#    "tags":{"total":N,"top":[{"tag":"...","count":N}]},
#    "unresolved":N}
#
# STORY-015 — Implement weekly-review.sh and morning.sh orchestration skills
# STORY-029 — Integrate native CLI diagnostics (tags + unresolved steps)
# Requires: lib.sh, all sub-skills, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
JSON_OUTPUT=false
_ARGS=()
for _a in "$@"; do
  [[ "$_a" == "--json" ]] && JSON_OUTPUT=true || _ARGS+=("$_a")
done

if [[ ${#_ARGS[@]} -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> [--json]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "${_ARGS[0]}")"
PROJECT_SLUG="${_ARGS[1]}"

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "weekly-review: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

# ---------------------------------------------------------------------------
# Sub-skill paths
# ---------------------------------------------------------------------------
CLI_LINT="$SCRIPT_DIR/cli-lint.sh"
CLI_ORPHANS="$SCRIPT_DIR/cli-orphans.sh"
CLI_RELATIONS="$SCRIPT_DIR/cli-relations.sh"
SYNC_ONTOLOGY="$SCRIPT_DIR/sync-ontology.sh"
SYNC_VOCAB="$SCRIPT_DIR/sync-vocab.sh"
SYNC_TOPK="$SCRIPT_DIR/sync-topk.sh"

for skill in "$CLI_LINT" "$CLI_ORPHANS" "$CLI_RELATIONS" "$SYNC_ONTOLOGY" "$SYNC_VOCAB" "$SYNC_TOPK"; do
  [[ -x "$skill" ]] || log_error "weekly-review: skill not found or not executable: $skill"
done

# ---------------------------------------------------------------------------
# Run all sub-commands; buffer output before daily note append
# ---------------------------------------------------------------------------
FAILED_CMD=""
TIMESTAMP="$(date '+%Y-%m-%d %H:%M')"

# cli-lint
lint_out="$(bash "$CLI_LINT" "$VAULT" "projects/${PROJECT_SLUG}" --json 2>&1)" \
  || { FAILED_CMD="cli-lint"; }
lint_issues=0
if [[ -z "$FAILED_CMD" ]]; then
  lint_issues="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('count',0))" \
    "$lint_out" 2>/dev/null || echo 0)"
fi

# cli-orphans
orphan_out="$(bash "$CLI_ORPHANS" "$VAULT" "projects/${PROJECT_SLUG}" --json 2>&1)" \
  || { [[ -z "$FAILED_CMD" ]] && FAILED_CMD="cli-orphans"; }
orphan_issues=0
if [[ -z "$FAILED_CMD" ]] || [[ "$FAILED_CMD" != "cli-lint" && -n "$orphan_out" ]]; then
  orphan_issues="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('count',0))" \
    "$orphan_out" 2>/dev/null || echo 0)"
fi

# cli-relations
rel_out="$(bash "$CLI_RELATIONS" "$VAULT" "projects/${PROJECT_SLUG}" --json 2>&1)" \
  || { [[ -z "$FAILED_CMD" ]] && FAILED_CMD="cli-relations"; }
rel_unknown=0
if [[ -n "$rel_out" ]]; then
  rel_unknown="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(len(d.get('unknownTypes',[])))" \
    "$rel_out" 2>/dev/null || echo 0)"
fi

# sync-ontology
ont_out="$(bash "$SYNC_ONTOLOGY" "$VAULT" "$PROJECT_SLUG" --json 2>&1)" \
  || { [[ -z "$FAILED_CMD" ]] && FAILED_CMD="sync-ontology"; }
ont_missing=0
if [[ -n "$ont_out" ]]; then
  ont_missing="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(len(d.get('missingInverses',[])))" \
    "$ont_out" 2>/dev/null || echo 0)"
fi

# sync-vocab
vocab_out="$(bash "$SYNC_VOCAB" "$VAULT" "$PROJECT_SLUG" 2>&1)" \
  || { [[ -z "$FAILED_CMD" ]] && FAILED_CMD="sync-vocab"; }

# sync-topk
topk_out="$(bash "$SYNC_TOPK" "$VAULT" "$PROJECT_SLUG" 2>&1)" \
  || { [[ -z "$FAILED_CMD" ]] && FAILED_CMD="sync-topk"; }

# Step 7: obsidian tags sort=count counts (direct CLI; fallback gracefully)
tags_json='{"total":0,"top":[]}'
if tags_raw="$(obsidian tags vault="$VAULT" sort=count counts 2>/dev/null)"; then
  tags_json="$(python3 - "$tags_raw" <<'PYEOF'
import sys, json, re
lines = [l.strip() for l in sys.argv[1].strip().splitlines() if l.strip()]
top = []
for line in lines:
    # expected format: "#tag  N" or "tag  N"
    m = re.match(r'^#?(\S+)\s+(\d+)$', line)
    if m:
        top.append({"tag": "#" + m.group(1), "count": int(m.group(2))})
print(json.dumps({"total": len(top), "top": top[:10]}))
PYEOF
  )" || tags_json='{"total":0,"top":[]}'
else
  printf 'WARN: [weekly-review] obsidian tags unavailable, skipping tag distribution\n' >&2
fi

# Step 8: obsidian unresolved (direct CLI; fallback to 0)
unresolved_count=0
if unresolved_raw="$(obsidian unresolved vault="$VAULT" 2>/dev/null)"; then
  unresolved_count="$(printf '%s' "$unresolved_raw" | grep -c '\[\[' 2>/dev/null || echo 0)"
else
  printf 'WARN: [weekly-review] obsidian unresolved unavailable, skipping\n' >&2
fi

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if $JSON_OUTPUT; then
  python3 - "$lint_issues" "$orphan_issues" "$rel_unknown" "$ont_missing" \
            "$tags_json" "$unresolved_count" <<'PYEOF'
import json, sys
print(json.dumps({
    "lint":      {"issues": int(sys.argv[1])},
    "orphans":   {"issues": int(sys.argv[2])},
    "relations": {"unknown": int(sys.argv[3])},
    "ontology":  {"missingInverses": int(sys.argv[4])},
    "tags":      json.loads(sys.argv[5]),
    "unresolved": int(sys.argv[6])
}))
PYEOF
else
  printf '[weekly-review] lint: %s issue(s)\n' "$lint_issues"
  printf '[weekly-review] orphans: %s issue(s)\n' "$orphan_issues"
  printf '[weekly-review] relations: %s unknown type(s)\n' "$rel_unknown"
  printf '[weekly-review] ontology: %s missing inverse(s)\n' "$ont_missing"
  printf '[weekly-review] vocab: updated\n'
  printf '[weekly-review] topk: updated\n'
  tags_total="$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('total',0))" \
    "$tags_json" 2>/dev/null || echo 0)"
  printf '[weekly-review] tags: %s unique tag(s)\n' "$tags_total"
  printf '[weekly-review] unresolved: %s wikilink(s)\n' "$unresolved_count"

  # Append summary to daily note (best-effort)
  SUMMARY="## Ontology Work Log

- lint: ${lint_issues} issue(s)
- orphans: ${orphan_issues} issue(s)
- relations: ${rel_unknown} unknown type(s)
- ontology: ${ont_missing} missing inverse(s)
- tags: ${tags_total} unique tag(s)
- unresolved: ${unresolved_count} wikilink(s)
- Review complete: ${TIMESTAMP}"

  daily_append "$VAULT" "$SUMMARY" > /dev/null 2>&1 || true
fi

# Report failure after all sub-commands have run
if [[ -n "$FAILED_CMD" ]]; then
  printf 'ERROR: weekly-review: sub-command failed: %s\n' "$FAILED_CMD" >&2
  exit 1
fi
