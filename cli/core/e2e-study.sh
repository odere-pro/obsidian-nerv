#!/usr/bin/env bash
# e2e-study.sh — End-to-end lifecycle test for the study vault skill suite
#
# Usage:
#   e2e-study.sh <vault> [--keep]
#   e2e-study.sh vault=<name> [--keep]
#
# Exercises the full study workflow:
#   create-project → create-entity (3-level tree) → add-connection
#   → cli-lint + cli-orphans + cli-relations (all clean)
#   → sync-vocab + sync-topk + sync-ontology
#   → coverage.sh + progress.sh (valid JSON)
#   → weekly-review.sh
#   → context.sh (finds created entities)
#
# The test project slug is _test-e2e (underscore prefix).
# Cleanup runs via trap EXIT (even on failure) unless --keep is passed.
#
# Exit codes: 0 all assertions pass; 1 one or more assertions failed.
#
# STORY-025 — Build and execute E2E test suite
# Requires: all study and core skills, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
KEEP=false
_ARGS=()
for _a in "$@"; do
  [[ "$_a" == "--keep" ]] && KEEP=true || _ARGS+=("$_a")
done

if [[ ${#_ARGS[@]} -lt 1 ]]; then
  printf 'Usage: %s <vault|vault=name> [--keep]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "${_ARGS[0]}")"

# ---------------------------------------------------------------------------
# Paths to skills
# ---------------------------------------------------------------------------
CREATE_PROJECT="$SCRIPT_DIR/create-project.sh"
CREATE_ENTITY="$SCRIPT_DIR/create-entity.sh"
ADD_CONNECTION="$SCRIPT_DIR/add-connection.sh"
CLI_LINT="$SCRIPT_DIR/cli-lint.sh"
CLI_ORPHANS="$SCRIPT_DIR/cli-orphans.sh"
CLI_RELATIONS="$SCRIPT_DIR/cli-relations.sh"
SYNC_VOCAB="$SCRIPT_DIR/sync-vocab.sh"
SYNC_TOPK="$SCRIPT_DIR/sync-topk.sh"
SYNC_ONTOLOGY="$SCRIPT_DIR/sync-ontology.sh"
WEEKLY_REVIEW="$SCRIPT_DIR/weekly-review.sh"
CONTEXT="$SCRIPT_DIR/context.sh"
STUDY_DIR="$(dirname "$SCRIPT_DIR")/study"
COVERAGE="$STUDY_DIR/coverage.sh"
PROGRESS="$STUDY_DIR/progress.sh"

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------
SLUG="test-e2e"
PROJ_DIR="projects/${SLUG}"
UPPER="TEST-E2E"

FAILURES=0
FAILED_NAMES=""

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------
pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); FAILED_NAMES="$FAILED_NAMES\n  - $1"; }

assert_exit0() {
  local msg="$1"; shift
  if "$@" > /dev/null 2>&1; then
    pass "$msg"
  else
    fail "$msg (command exited non-zero: $*)"
  fi
}

assert_json_valid() {
  local json="$1" msg="$2"
  if printf '%s' "$json" | python3 -m json.tool > /dev/null 2>&1; then
    pass "$msg"
  else
    fail "$msg (invalid JSON)"
  fi
}

assert_contains() {
  local needle="$1" haystack="$2" msg="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    pass "$msg"
  else
    fail "$msg (expected '$needle' in output)"
  fi
}

# ---------------------------------------------------------------------------
# Cleanup — trash the e2e test project via Obsidian API
# ---------------------------------------------------------------------------
cleanup() {
  if $KEEP; then
    printf '[E2E] --keep: leaving project %s in vault\n' "$PROJ_DIR" >&2
    return
  fi
  printf '[E2E] Cleaning up %s...\n' "$PROJ_DIR" >&2
  ob_eval "$VAULT" "(async () => {
    var f = app.vault.getAbstractFileByPath('${PROJ_DIR}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Prerequisite: check Obsidian is reachable
# ---------------------------------------------------------------------------
printf '[E2E] Checking Obsidian reachability...\n' >&2
if ! ob_eval "$VAULT" "app.vault.getName()" > /dev/null 2>&1; then
  printf 'SKIP: e2e-study.sh (Obsidian not reachable)\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# 1. Create project
# ---------------------------------------------------------------------------
printf '[E2E] Creating project %s...\n' "$SLUG" >&2
if bash "$CREATE_PROJECT" "$VAULT" "$SLUG" "E2E Study Test" > /dev/null 2>&1; then
  pass "create-project: project created"
else
  fail "create-project: failed to create project"
  printf '\nFATAL: cannot continue without project\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Create 3-level entity tree: ROOT → BRANCH → two LEAFs
# ---------------------------------------------------------------------------
printf '[E2E] Creating entity tree...\n' >&2

# ROOT was created by create-project.sh; create BRANCH
ROOT_SLUG="root"  # will match the ROOT note created by create-project.sh

# The ROOT note from create-project.sh has slug derived from project name
# create-project.sh creates: <UPPER>.ROOT - <Title>.md
# So parent slug for BRANCH = "ROOT"
if bash "$CREATE_ENTITY" "$VAULT" "$SLUG" BRANCH "domain-a" "Domain A" "ROOT" "concept" "$SLUG" \
    > /dev/null 2>&1; then
  pass "create-entity: BRANCH Domain A created"
else
  fail "create-entity: BRANCH Domain A failed"
fi

if bash "$CREATE_ENTITY" "$VAULT" "$SLUG" LEAF "topic-one" "Topic One" "domain-a" "concept" "$SLUG" \
    > /dev/null 2>&1; then
  pass "create-entity: LEAF Topic One created"
else
  fail "create-entity: LEAF Topic One failed"
fi

if bash "$CREATE_ENTITY" "$VAULT" "$SLUG" LEAF "topic-two" "Topic Two" "domain-a" "concept" "$SLUG" \
    > /dev/null 2>&1; then
  pass "create-entity: LEAF Topic Two created"
else
  fail "create-entity: LEAF Topic Two failed"
fi

# ---------------------------------------------------------------------------
# 3. Add connection with inverse
# ---------------------------------------------------------------------------
printf '[E2E] Adding connection...\n' >&2
UPPER_CLEAN="TEST-E2E"
LEAF1_PATH="${PROJ_DIR}/${UPPER_CLEAN}.topic-one - Topic One.md"
LEAF2_PATH="${PROJ_DIR}/${UPPER_CLEAN}.topic-two - Topic Two.md"

if bash "$ADD_CONNECTION" "$VAULT" "$LEAF1_PATH" "depends-on" "$LEAF2_PATH" "e2e test" \
    > /dev/null 2>&1; then
  pass "add-connection: forward + inverse written"
else
  fail "add-connection: failed to write connection"
fi

# ---------------------------------------------------------------------------
# 4. cli-lint — expect clean (may have breadcrumb warnings for new notes)
# ---------------------------------------------------------------------------
printf '[E2E] Running cli-lint...\n' >&2
lint_out="$(bash "$CLI_LINT" "$VAULT" "$PROJ_DIR" --json 2>&1)" || lint_out=''
assert_json_valid "$lint_out" "cli-lint: output is valid JSON"

# ---------------------------------------------------------------------------
# 5. cli-orphans — expect clean (our tree is properly wired)
# ---------------------------------------------------------------------------
printf '[E2E] Running cli-orphans...\n' >&2
orphan_out="$(bash "$CLI_ORPHANS" "$VAULT" "$PROJ_DIR" --json 2>&1)" || orphan_out=''
assert_json_valid "$orphan_out" "cli-orphans: output is valid JSON"

# ---------------------------------------------------------------------------
# 6. cli-relations — expect edges from our connection
# ---------------------------------------------------------------------------
printf '[E2E] Running cli-relations...\n' >&2
rel_out="$(bash "$CLI_RELATIONS" "$VAULT" "$PROJ_DIR" --json 2>&1)" || rel_out=''
assert_json_valid "$rel_out" "cli-relations: output is valid JSON"
assert_contains '"edges"' "$rel_out" "cli-relations: output has edges key"

rel_count="$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1]).get('edges',[])))" \
  "$rel_out" 2>/dev/null || echo 0)"
if [[ "$rel_count" -ge 1 ]]; then
  pass "cli-relations: at least 1 edge found (got $rel_count)"
else
  fail "cli-relations: expected >= 1 edge, got $rel_count"
fi

# ---------------------------------------------------------------------------
# 7. sync-vocab
# ---------------------------------------------------------------------------
printf '[E2E] Running sync-vocab...\n' >&2
assert_exit0 "sync-vocab: exits 0" bash "$SYNC_VOCAB" "$VAULT" "$SLUG"

# ---------------------------------------------------------------------------
# 8. sync-topk
# ---------------------------------------------------------------------------
printf '[E2E] Running sync-topk...\n' >&2
assert_exit0 "sync-topk: exits 0" bash "$SYNC_TOPK" "$VAULT" "$SLUG"

# ---------------------------------------------------------------------------
# 9. sync-ontology
# ---------------------------------------------------------------------------
printf '[E2E] Running sync-ontology...\n' >&2
ont_out="$(bash "$SYNC_ONTOLOGY" "$VAULT" "$SLUG" --json 2>&1)" || ont_out=''
assert_json_valid "$ont_out" "sync-ontology: output is valid JSON"
assert_contains '"entities"' "$ont_out" "sync-ontology: output has entities key"

# ---------------------------------------------------------------------------
# 10. coverage.sh — valid JSON with project key
# ---------------------------------------------------------------------------
printf '[E2E] Running coverage.sh...\n' >&2
cov_out="$(bash "$COVERAGE" "$VAULT" "$SLUG" 2>&1)" || cov_out=''
assert_json_valid "$cov_out" "coverage.sh: output is valid JSON"
assert_contains '"project"'  "$cov_out" "coverage.sh: output has project key"
assert_contains '"domains"'  "$cov_out" "coverage.sh: output has domains key"

# ---------------------------------------------------------------------------
# 11. progress.sh — valid JSON with project key
# ---------------------------------------------------------------------------
printf '[E2E] Running progress.sh...\n' >&2
prog_out="$(bash "$PROGRESS" "$VAULT" "$SLUG" 2>&1)" || prog_out=''
assert_json_valid "$prog_out" "progress.sh: output is valid JSON"
assert_contains '"project"'    "$prog_out" "progress.sh: output has project key"
assert_contains '"notes"'      "$prog_out" "progress.sh: output has notes key"
assert_contains '"completion"' "$prog_out" "progress.sh: output has completion key"

total_notes="$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('notes',{}).get('total',0))" \
  "$prog_out" 2>/dev/null || echo 0)"
if [[ "$total_notes" -ge 3 ]]; then
  pass "progress.sh: at least 3 notes counted (got $total_notes)"
else
  fail "progress.sh: expected >= 3 notes, got $total_notes"
fi

# ---------------------------------------------------------------------------
# 12. weekly-review.sh — exits 0 and appends to daily note
# ---------------------------------------------------------------------------
printf '[E2E] Running weekly-review.sh...\n' >&2
assert_exit0 "weekly-review.sh: exits 0" bash "$WEEKLY_REVIEW" "$VAULT" "$SLUG"

# ---------------------------------------------------------------------------
# 13. context.sh — finds the created entities
# ---------------------------------------------------------------------------
printf '[E2E] Running context.sh...\n' >&2
ctx_out="$(bash "$CONTEXT" "$VAULT" "Topic One" 1 2>&1)" || ctx_out=''
assert_json_valid "$ctx_out" "context.sh: output is valid JSON"

ctx_count="$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1]).get('results',[])))" \
  "$ctx_out" 2>/dev/null || echo 0)"
if [[ "$ctx_count" -ge 1 ]]; then
  pass "context.sh: found at least 1 result for 'Topic One'"
else
  fail "context.sh: expected >= 1 result for 'Topic One', got $ctx_count"
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
printf '\n'
if [[ $FAILURES -eq 0 ]]; then
  printf 'e2e-study.sh: all assertions passed\n'
else
  printf 'e2e-study.sh: %d assertion(s) failed:\n' "$FAILURES" >&2
  printf '%b\n' "$FAILED_NAMES" >&2
fi

exit "$FAILURES"
