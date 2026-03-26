#!/usr/bin/env bash
# e2e-dev.sh — End-to-end lifecycle test for the dev vault skill suite
#
# Usage:
#   e2e-dev.sh <vault> [--keep]
#   e2e-dev.sh vault=<name> [--keep]
#
# Exercises the full dev workflow:
#   create-project (scaffolded)
#   → adr.sh (ADR created with correct frontmatter and sections)
#   → code-link.sh (idempotent run)
#   → dependency-map.sh (returns correct edges)
#   → weekly-review.sh (exits 0)
#
# The test project slug is test-e2e-dev (distinct from study E2E).
# Cleanup runs via trap EXIT (even on failure) unless --keep is passed.
#
# Exit codes: 0 all assertions pass; 1 one or more assertions failed.
#
# STORY-025 — Build and execute E2E test suite
# Requires: dev and core skills, Obsidian running (Limitation L1).

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
WEEKLY_REVIEW="$SCRIPT_DIR/weekly-review.sh"
DEV_DIR="$(dirname "$SCRIPT_DIR")/dev"
ADR="$DEV_DIR/adr.sh"
CODE_LINK="$DEV_DIR/code-link.sh"
DEPENDENCY_MAP="$DEV_DIR/dependency-map.sh"

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------
SLUG="test-e2e-dev"
PROJ_DIR="projects/${SLUG}"
UPPER="TEST-E2E-DEV"

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
    printf '[E2E-DEV] --keep: leaving project %s in vault\n' "$PROJ_DIR" >&2
    return
  fi
  printf '[E2E-DEV] Cleaning up %s...\n' "$PROJ_DIR" >&2
  ob_eval "$VAULT" "(async () => {
    var f = app.vault.getAbstractFileByPath('${PROJ_DIR}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Prerequisite: check Obsidian is reachable
# ---------------------------------------------------------------------------
printf '[E2E-DEV] Checking Obsidian reachability...\n' >&2
if ! ob_eval "$VAULT" "app.vault.getName()" > /dev/null 2>&1; then
  printf 'SKIP: e2e-dev.sh (Obsidian not reachable)\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# 1. Scaffold project
# ---------------------------------------------------------------------------
printf '[E2E-DEV] Scaffolding project %s...\n' "$SLUG" >&2
if bash "$CREATE_PROJECT" "$VAULT" "$SLUG" "E2E Dev Test" > /dev/null 2>&1; then
  pass "create-project: project scaffolded"
else
  fail "create-project: failed to scaffold project"
  printf '\nFATAL: cannot continue without project\n' >&2
  exit 1
fi

# Verify expected scaffold files exist
for artifact in \
    "${PROJ_DIR}/${UPPER}.ROOT - E2E Dev Test.md" \
    "${PROJ_DIR}/_ontology.${SLUG}.md" \
    "${PROJ_DIR}/_vocab.${SLUG}.md" \
    "${PROJ_DIR}/_topk.${SLUG}.md"; do
  exists="$(ob_eval "$VAULT" \
    "app.vault.getAbstractFileByPath('${artifact}') ? 'yes' : 'no'" 2>/dev/null \
    || echo 'no')"
  if [[ "$exists" == "yes" ]]; then
    pass "scaffold: ${artifact} exists"
  else
    fail "scaffold: ${artifact} missing"
  fi
done

# ---------------------------------------------------------------------------
# 2. Create two LEAF notes to have dependency edges between them
# ---------------------------------------------------------------------------
printf '[E2E-DEV] Creating service nodes...\n' >&2

if bash "$CREATE_ENTITY" "$VAULT" "$SLUG" LEAF "svc-alpha" "Service Alpha" "ROOT" "service" "$SLUG" \
    > /dev/null 2>&1; then
  pass "create-entity: Service Alpha created"
else
  fail "create-entity: Service Alpha failed"
fi

if bash "$CREATE_ENTITY" "$VAULT" "$SLUG" LEAF "svc-beta" "Service Beta" "ROOT" "service" "$SLUG" \
    > /dev/null 2>&1; then
  pass "create-entity: Service Beta created"
else
  fail "create-entity: Service Beta failed"
fi

# Add a depends-on edge from Alpha → Beta
ALPHA_PATH="${PROJ_DIR}/${UPPER}.svc-alpha - Service Alpha.md"
BETA_PATH="${PROJ_DIR}/${UPPER}.svc-beta - Service Beta.md"

if bash "$ADD_CONNECTION" "$VAULT" "$ALPHA_PATH" "depends-on" "$BETA_PATH" \
    > /dev/null 2>&1; then
  pass "add-connection: depends-on edge added"
else
  fail "add-connection: failed to add edge"
fi

# ---------------------------------------------------------------------------
# 3. adr.sh — create an ADR with correct frontmatter and sections
# ---------------------------------------------------------------------------
printf '[E2E-DEV] Creating ADR...\n' >&2
adr_out="$(bash "$ADR" "$VAULT" "$SLUG" "Use REST over gRPC" "ROOT" 2>&1)" \
  || adr_out=""

# Verify ADR note was created (look for an adr-* note in the project)
adr_exists="$(ob_eval "$VAULT" \
  "(function(){ return app.vault.getMarkdownFiles().some(f => f.path.startsWith('${PROJ_DIR}/') && f.name.includes('adr-')) ? 'yes' : 'no'; })()" \
  2>/dev/null || echo 'no')"

if [[ "$adr_exists" == "yes" ]]; then
  pass "adr.sh: ADR note created"
else
  fail "adr.sh: ADR note not found in $PROJ_DIR"
fi

# Verify ADR has kind: decision (read frontmatter)
adr_path="$(ob_eval "$VAULT" \
  "(function(){ var f = app.vault.getMarkdownFiles().find(f => f.path.startsWith('${PROJ_DIR}/') && f.name.includes('adr-')); return f ? f.path : ''; })()" \
  2>/dev/null || echo '')"

if [[ -n "$adr_path" ]]; then
  adr_kind="$(ob_eval "$VAULT" \
    "(function(){ var f = app.vault.getAbstractFileByPath('${adr_path}'); if(!f) return ''; var c = app.metadataCache.getFileCache(f); return c && c.frontmatter ? (c.frontmatter.kind || '') : ''; })()" \
    2>/dev/null || echo '')"
  if [[ "$adr_kind" == "decision" ]]; then
    pass "adr.sh: kind is 'decision'"
  else
    fail "adr.sh: expected kind='decision', got '$adr_kind'"
  fi
fi

# ---------------------------------------------------------------------------
# 4. code-link.sh — idempotency (run twice, second run exits 0)
# ---------------------------------------------------------------------------
printf '[E2E-DEV] Running code-link.sh (idempotency)...\n' >&2
CODE_FILE="src/main.py"
NOTE_PATH="${ALPHA_PATH}"

# First run
bash "$CODE_LINK" "$VAULT" "$NOTE_PATH" "$CODE_FILE" > /dev/null 2>&1 || true
# Second run must be idempotent (exit 0)
if bash "$CODE_LINK" "$VAULT" "$NOTE_PATH" "$CODE_FILE" > /dev/null 2>&1; then
  pass "code-link.sh: idempotent (second run exits 0)"
else
  fail "code-link.sh: second run failed (not idempotent)"
fi

# ---------------------------------------------------------------------------
# 5. dependency-map.sh — returns edges including our depends-on edge
# ---------------------------------------------------------------------------
printf '[E2E-DEV] Running dependency-map.sh...\n' >&2
dep_out="$(bash "$DEPENDENCY_MAP" "$VAULT" "$SLUG" 2>&1)" || dep_out=''
assert_json_valid "$dep_out" "dependency-map.sh: output is valid JSON"
assert_contains '"edges"'   "$dep_out" "dependency-map.sh: output has edges key"
assert_contains '"project"' "$dep_out" "dependency-map.sh: output has project key"

dep_count="$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1]).get('edges',[])))" \
  "$dep_out" 2>/dev/null || echo 0)"
if [[ "$dep_count" -ge 1 ]]; then
  pass "dependency-map.sh: at least 1 depends-on edge found (got $dep_count)"
else
  fail "dependency-map.sh: expected >= 1 edge, got $dep_count"
fi

# ---------------------------------------------------------------------------
# 6. weekly-review.sh — exits clean (0)
# ---------------------------------------------------------------------------
printf '[E2E-DEV] Running weekly-review.sh...\n' >&2
assert_exit0 "weekly-review.sh: exits 0" bash "$WEEKLY_REVIEW" "$VAULT" "$SLUG"

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
printf '\n'
if [[ $FAILURES -eq 0 ]]; then
  printf 'e2e-dev.sh: all assertions passed\n'
else
  printf 'e2e-dev.sh: %d assertion(s) failed:\n' "$FAILURES" >&2
  printf '%b\n' "$FAILED_NAMES" >&2
fi

exit "$FAILURES"
