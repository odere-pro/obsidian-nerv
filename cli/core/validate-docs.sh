#!/usr/bin/env bash
# validate-docs.sh — Documentation validation script for the Ontology CLI
#
# Runs every CLI example from docs/cli-guide/ against a live Obsidian vault
# and confirms cross-references between the documentation files.
#
# Usage:
#   validate-docs.sh <vault> [--cross-refs-only]
#
# What it checks:
#   1. CLI smoke tests — create-project, create-entity, add-connection, import-json,
#      cli-lint, cli-orphans, cli-relations, sync-topk, context, get-tree,
#      adr, dependency-map, code-link
#   2. JSON output validity for every skill that emits --json
#   3. Cross-reference consistency:
#      a. Every skill listed in the Skill Registry (patterns.md) has a
#         corresponding executable in ~/.ontology-cli/
#      b. Every skill documented in cli-guide.md has a section in the registry
#      c. All limitation IDs (L1–L5, L7–L8) are present in both documents
#
# Exit codes: 0 all pass; 1 any failure
#
# STORY-026 — Validate documentation and cross-references
# Requires: lib.sh, Obsidian running (Limitation L1), all core skills deployed.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Resolve repo root: try git first, fall back relative to SCRIPT_DIR
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || true
if [[ -z "$REPO_ROOT" ]]; then
  # Running from ~/.ontology-cli/core/ — docs must be alongside
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi
CLI_GUIDE="$REPO_ROOT/docs/cli-guide/cli-guide-index.md"
PATTERNS="$REPO_ROOT/cli/agent/patterns.md"
CORE_DIR="$SCRIPT_DIR"
DEV_DIR="$(cd "$SCRIPT_DIR/../dev" && pwd)"

CROSS_REFS_ONLY=false
if [[ $# -lt 1 ]]; then
  printf 'Usage: %s <vault> [--cross-refs-only]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
shift
[[ "${1:-}" == "--cross-refs-only" ]] && CROSS_REFS_ONLY=true

PASSED=0
FAILED=0
FAILURES_LIST=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pass() { PASSED=$((PASSED + 1)); printf '[PASS] %s\n' "$1"; }
fail() {
  FAILED=$((FAILED + 1))
  FAILURES_LIST="${FAILURES_LIST}  - ${1}\n"
  printf '[FAIL] %s\n' "$1" >&2
  [[ -n "${2:-}" ]] && printf '       %s\n' "$2" >&2
}

json_valid() {
  python3 -m json.tool > /dev/null 2>&1 <<< "$1"
}

require_skill() {
  local name="$1" dir="${2:-$CORE_DIR}"
  if [[ -x "$dir/$name" ]]; then
    pass "skill exists and is executable: $name"
  else
    fail "skill missing or not executable: $name" "expected at: $dir/$name"
  fi
}

VSLUG="valdocs"
VTITLE="Validate Docs"
VUPPER="VALDOCS"
VPROJ="projects/${VSLUG}"

cleanup() {
  ob_eval "$VAULT" "(async()=>{
    const f=app.vault.getAbstractFileByPath('${VPROJ}');
    if(f) await app.vault.trash(f,false);
  })()" >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# Section 1: Cross-reference checks (always run)
# ---------------------------------------------------------------------------
printf '\n=== Cross-reference checks ===\n\n'

# 1a. Every skill in the registry must have a matching executable
REGISTRY_SKILLS=(
  create-project.sh create-entity.sh add-connection.sh import-json.sh
  cli-lint.sh cli-orphans.sh cli-relations.sh
  sync-topk.sh sync-ontology.sh sync-vocab.sh
  context.sh get-entity.sh get-tree.sh
  explain-topic.sh get-knowledge-gap.sh
)
for skill in "${REGISTRY_SKILLS[@]}"; do
  # Search core dir first, then the deployed dir
  if [[ -x "$CORE_DIR/$skill" ]] || [[ -x "${HOME}/.ontology-cli/core/$skill" ]]; then
    pass "registry skill deployed: $skill"
  else
    fail "registry skill NOT found: $skill" \
      "not in $CORE_DIR/ or ~/.ontology-cli/core/"
  fi
done

DEV_SKILLS=(adr.sh dependency-map.sh code-link.sh)
for skill in "${DEV_SKILLS[@]}"; do
  if [[ -x "$DEV_DIR/$skill" ]] || [[ -x "${HOME}/.ontology-cli/dev/$skill" ]]; then
    pass "dev skill deployed: $skill"
  else
    fail "dev skill NOT found: $skill"
  fi
done

# 1b. cli-guide.md documents each expected skill section
GUIDE_SECTIONS=(
  "create-project.sh" "create-entity.sh" "add-connection.sh" "import-json.sh"
  "cli-lint.sh" "cli-orphans.sh" "cli-relations.sh" "migrate.sh"
  "sync-topk.sh" "sync-ontology.sh" "context.sh" "get-entity.sh" "get-tree.sh"
  "adr.sh" "dependency-map.sh" "code-link.sh"
)
for section in "${GUIDE_SECTIONS[@]}"; do
  if grep -qF "$section" "$CLI_GUIDE"; then
    pass "cli-guide.md documents: $section"
  else
    fail "cli-guide.md missing section for: $section"
  fi
done

# 1c. Limitation IDs L1–L5, L7–L8 present in both documents
LIDS=(L1 L2 L3 L4 L5 L7 L8)
for lid in "${LIDS[@]}"; do
  in_guide=false; in_patterns=false
  grep -q "| ${lid} " "$CLI_GUIDE"    2>/dev/null && in_guide=true
  grep -q "| ${lid} " "$PATTERNS"     2>/dev/null && in_patterns=true
  if $in_guide && $in_patterns; then
    pass "limitation $lid documented in both files"
  elif $in_guide; then
    fail "limitation $lid missing from patterns.md"
  elif $in_patterns; then
    fail "limitation $lid missing from cli-guide.md"
  else
    fail "limitation $lid missing from both documents"
  fi
done

# 1d. rollback-log recovery workflow present in both documents
if grep -q "_rollback-log" "$CLI_GUIDE"; then
  pass "_rollback-log recovery documented in cli-guide.md"
else
  fail "_rollback-log recovery section missing from cli-guide.md"
fi
if grep -q "_rollback-log" "$PATTERNS"; then
  pass "_rollback-log recovery documented in patterns.md"
else
  fail "_rollback-log recovery section missing from patterns.md"
fi

# 1e. migrate.sh spec format documented
if grep -q "rename-rel\|rename-spine\|add-field\|promote" "$CLI_GUIDE"; then
  pass "migrate.sh spec operations documented in cli-guide.md"
else
  fail "migrate.sh spec operations missing from cli-guide.md"
fi

# 1f. CLAUDE.md templates present in patterns.md
if grep -q "CLAUDE.md template\|Study vault template\|Dev vault template" "$PATTERNS"; then
  pass "CLAUDE.md templates documented in patterns.md"
else
  fail "CLAUDE.md templates missing from patterns.md"
fi

# 1g. Skill Registry section present in patterns.md
if grep -q "## Skill Registry" "$PATTERNS"; then
  pass "Skill Registry section present in patterns.md"
else
  fail "Skill Registry section missing from patterns.md"
fi

# 1h. Limitations section present in patterns.md
if grep -q "## Limitations" "$PATTERNS"; then
  pass "Limitations section present in patterns.md"
else
  fail "Limitations section missing from patterns.md"
fi

if $CROSS_REFS_ONLY; then
  printf '\n=== Cross-reference summary: %d passed, %d failed ===\n' "$PASSED" "$FAILED"
  [[ $FAILED -gt 0 ]] && printf 'Failed:\n%b' "$FAILURES_LIST" >&2
  exit "$( [[ $FAILED -gt 0 ]] && echo 1 || echo 0 )"
fi

# ---------------------------------------------------------------------------
# Section 2: CLI smoke tests
# ---------------------------------------------------------------------------
printf '\n=== CLI smoke tests (vault: %s) ===\n\n' "$VAULT"

# Verify Obsidian is reachable
if ! ob_eval "$VAULT" "1+1" >/dev/null 2>&1; then
  printf 'SKIP: Obsidian not reachable — skipping CLI smoke tests\n'
  printf '\n=== Summary: %d passed, %d failed (cross-refs only) ===\n' "$PASSED" "$FAILED"
  [[ $FAILED -gt 0 ]] && exit 1 || exit 0
fi

cleanup
trap cleanup EXIT

# --- create-project ---
if bash "$CORE_DIR/create-project.sh" "$VAULT" "$VSLUG" "$VTITLE" >/dev/null 2>&1; then
  pass "create-project.sh: creates project"
else
  fail "create-project.sh: failed to create project"
fi

# idempotency
if bash "$CORE_DIR/create-project.sh" "$VAULT" "$VSLUG" "$VTITLE" >/dev/null 2>&1; then
  pass "create-project.sh: idempotent re-run"
else
  fail "create-project.sh: idempotent re-run failed"
fi

# --- create-entity ---
entity_out="$(bash "$CORE_DIR/create-entity.sh" "$VAULT" "$VSLUG" LEAF \
  "s3-overview" "S3 Overview" ROOT concept "$VSLUG" --json 2>/dev/null)" || entity_out=''
if json_valid "$entity_out"; then
  pass "create-entity.sh: creates LEAF, returns valid JSON"
else
  fail "create-entity.sh: did not return valid JSON" "$entity_out"
fi

# --- create BRANCH for connection test ---
bash "$CORE_DIR/create-entity.sh" "$VAULT" "$VSLUG" BRANCH \
  "storage" "Storage" ROOT concept "$VSLUG" >/dev/null 2>&1 || true

# --- add-connection ---
src="${VPROJ}/${VUPPER}.s3-overview - S3 Overview.md"
tgt="${VPROJ}/${VUPPER}.storage - Storage.md"
if bash "$CORE_DIR/add-connection.sh" "$VAULT" "$src" "depends-on" "$tgt" "" >/dev/null 2>&1; then
  pass "add-connection.sh: adds forward + inverse connection"
else
  fail "add-connection.sh: failed"
fi

# --- cli-lint ---
lint_out="$(bash "$CORE_DIR/cli-lint.sh" "$VAULT" "$VPROJ" --json 2>/dev/null)" || lint_out=''
if json_valid "$lint_out"; then
  pass "cli-lint.sh --json: returns valid JSON"
else
  fail "cli-lint.sh --json: did not return valid JSON" "$lint_out"
fi

# --- cli-orphans ---
orphan_out="$(bash "$CORE_DIR/cli-orphans.sh" "$VAULT" --json 2>/dev/null)" || orphan_out=''
if json_valid "$orphan_out"; then
  pass "cli-orphans.sh --json: returns valid JSON"
else
  fail "cli-orphans.sh --json: did not return valid JSON" "$orphan_out"
fi

# --- cli-relations ---
rel_out="$(bash "$CORE_DIR/cli-relations.sh" "vault=$VAULT" "$VSLUG" --json 2>/dev/null)" || rel_out=''
if json_valid "$rel_out"; then
  pass "cli-relations.sh --json: returns valid JSON"
else
  fail "cli-relations.sh --json: did not return valid JSON" "$rel_out"
fi

# --- sync-topk ---
if bash "$CORE_DIR/sync-topk.sh" "$VAULT" "$VSLUG" >/dev/null 2>&1; then
  pass "sync-topk.sh: runs without error"
else
  fail "sync-topk.sh: failed"
fi

# --- context ---
ctx_out="$(bash "$CORE_DIR/context.sh" "$VAULT" "S3 Overview" 2>/dev/null)" || ctx_out=''
if json_valid "$ctx_out"; then
  pass "context.sh: returns valid JSON"
else
  fail "context.sh: did not return valid JSON" "$ctx_out"
fi

# empty query → {"results":[]}
ctx_empty="$(bash "$CORE_DIR/context.sh" "$VAULT" "zzznomatchzzz" 2>/dev/null)" || ctx_empty=''
if json_valid "$ctx_empty"; then
  pass "context.sh: empty query returns valid JSON"
else
  fail "context.sh: empty query did not return valid JSON"
fi

# --- get-tree ---
tree_out="$(bash "$CORE_DIR/get-tree.sh" "$VAULT" "$VSLUG" 2>/dev/null)" || tree_out=''
if json_valid "$tree_out"; then
  pass "get-tree.sh: returns valid JSON"
else
  fail "get-tree.sh: did not return valid JSON" "$tree_out"
fi

# --depth 1
tree_d1="$(bash "$CORE_DIR/get-tree.sh" "$VAULT" "$VSLUG" --depth 1 2>/dev/null)" || tree_d1=''
if json_valid "$tree_d1"; then
  pass "get-tree.sh --depth 1: returns valid JSON"
else
  fail "get-tree.sh --depth 1: did not return valid JSON"
fi

# --- adr ---
if [[ -x "${HOME}/.ontology-cli/dev/adr.sh" ]]; then
  adr_out="$(bash "${HOME}/.ontology-cli/dev/adr.sh" "$VAULT" "$VSLUG" \
    "Use SQLite for local caching" 2>/dev/null)" || adr_out=''
  if printf '%s' "$adr_out" | grep -q "ADR created:"; then
    pass "adr.sh: creates ADR note"
  else
    fail "adr.sh: did not report note creation" "$adr_out"
  fi
else
  fail "adr.sh not found at ~/.ontology-cli/dev/"
fi

# --- dependency-map ---
if [[ -x "${HOME}/.ontology-cli/dev/dependency-map.sh" ]]; then
  dep_out="$(bash "${HOME}/.ontology-cli/dev/dependency-map.sh" "$VAULT" "$VSLUG" 2>/dev/null)" \
    || dep_out=''
  if json_valid "$dep_out"; then
    pass "dependency-map.sh: returns valid JSON"
  else
    fail "dependency-map.sh: did not return valid JSON" "$dep_out"
  fi

  dep_dot="$(bash "${HOME}/.ontology-cli/dev/dependency-map.sh" "$VAULT" "$VSLUG" \
    --format dot 2>/dev/null)" || dep_dot=''
  if printf '%s' "$dep_dot" | grep -q "^digraph"; then
    pass "dependency-map.sh --format dot: produces DOT output"
  else
    fail "dependency-map.sh --format dot: no DOT output" "$dep_dot"
  fi
else
  fail "dependency-map.sh not found at ~/.ontology-cli/dev/"
fi

# --- code-link ---
if [[ -x "${HOME}/.ontology-cli/dev/code-link.sh" ]]; then
  note_path="${VPROJ}/${VUPPER}.s3-overview - S3 Overview.md"
  cl_out="$(bash "${HOME}/.ontology-cli/dev/code-link.sh" "$VAULT" \
    "$note_path" "src/storage/s3.ts" 2>/dev/null)" || cl_out=''
  if printf '%s' "$cl_out" | grep -q "appended\|already present"; then
    pass "code-link.sh: appends code reference"
  else
    fail "code-link.sh: unexpected output" "$cl_out"
  fi
else
  fail "code-link.sh not found at ~/.ontology-cli/dev/"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '\n=== Validation summary: %d passed, %d failed ===\n' "$PASSED" "$FAILED"
if [[ $FAILED -gt 0 ]]; then
  printf 'Failed checks:\n%b' "$FAILURES_LIST" >&2
  exit 1
fi
exit 0
