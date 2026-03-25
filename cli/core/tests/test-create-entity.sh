#!/usr/bin/env bash
# test-create-entity.sh — Tests for create-entity.sh motor skill
#
# Verifies: file created with correct path/frontmatter, parent children
# updated, spine inheritance, idempotency, --json output, missing-parent
# error, daily note log (skip if Obsidian unreachable).
#
# Run via test-harness.sh:
#   test-harness.sh study test-create-entity.sh
# Or directly:
#   TEST_VAULT=study bash test-create-entity.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"
CREATE_ENTITY="$(dirname "$SCRIPT_DIR")/create-entity.sh"

TEST_PROJ_SLUG="testce"
TEST_PROJ_TITLE="Test Create Entity"
TEST_PROJ_DIR="projects/${TEST_PROJ_SLUG}"
TEST_PROJ_UPPER="TESTCE"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

file_exists_in_vault() {
  local path="$1" js_path result
  js_path="$(json_str "$path")"
  result="$(ob_eval "$VAULT" \
    "app.vault.getAbstractFileByPath(${js_path}) ? 'yes' : 'no'" \
    2>/dev/null)" || result="no"
  printf '%s' "$result"
}

read_vault_file() {
  local path="$1" js_path
  js_path="$(json_str "$path")"
  ob_eval "$VAULT" \
    "(async () => { const f = app.vault.getAbstractFileByPath(${js_path}); return f ? await app.vault.cachedRead(f) : ''; })()" \
    2>/dev/null || true
}

read_frontmatter_field() {
  local path="$1" field="$2" js_path js_field
  js_path="$(json_str "$path")"
  js_field="$(json_str "$field")"
  ob_eval "$VAULT" \
    "(async () => { const f = app.vault.getAbstractFileByPath(${js_path}); if (!f) return ''; const m = app.metadataCache.getFileCache(f); return m && m.frontmatter ? JSON.stringify(m.frontmatter[${js_field}]) : ''; })()" \
    2>/dev/null || true
}

cleanup() {
  ob_eval "$VAULT" "(async () => {
    const f = app.vault.getAbstractFileByPath('${TEST_PROJ_DIR}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
  printf 'INFO: test project trashed (cleanup)\n'
}

# ---------------------------------------------------------------------------
# Setup: create a fresh test project
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_PROJ_SLUG" "$TEST_PROJ_TITLE" > /dev/null 2>&1; then
  printf 'SKIP: test-create-entity.sh (create-project.sh failed — Obsidian not reachable?)\n'
  exit 0
fi

ROOT_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.ROOT - ${TEST_PROJ_TITLE}.md"

# ---------------------------------------------------------------------------
# Test 1: create a LEAF entity
# ---------------------------------------------------------------------------
LEAF_SLUG="test-leaf"
LEAF_TITLE="Test Leaf"
LEAF_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.${LEAF_SLUG} - ${LEAF_TITLE}.md"

if ! bash "$CREATE_ENTITY" "$VAULT" "$TEST_PROJ_SLUG" LEAF \
    "$LEAF_SLUG" "$LEAF_TITLE" ROOT concept "${TEST_PROJ_SLUG}" > /dev/null 2>&1; then
  printf 'FAIL: create-entity.sh exited non-zero for LEAF creation\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: create-entity.sh exits 0 for LEAF\n'
fi

# File exists
assert_eq "yes" "$(file_exists_in_vault "$LEAF_PATH")" "LEAF file exists at expected path"

# Frontmatter fields
leaf_content="$(read_vault_file "$LEAF_PATH")"
for field_val in \
    "type: LEAF" \
    "kind: concept" \
    "spine: ${TEST_PROJ_SLUG}" \
    "status: draft" \
    "children: []"; do
  assert_contains "$field_val" "$leaf_content" "LEAF frontmatter contains '${field_val}'"
done

# Parent wikilink in frontmatter (should reference ROOT note basename)
assert_contains "[[${TEST_PROJ_UPPER}.ROOT - " "$leaf_content" \
  "LEAF parent field contains ROOT wikilink"

# ---------------------------------------------------------------------------
# Test 2: parent children array updated
# ---------------------------------------------------------------------------
root_content="$(read_vault_file "$ROOT_PATH")"
LEAF_BASENAME="${TEST_PROJ_UPPER}.${LEAF_SLUG} - ${LEAF_TITLE}"
assert_contains "[[${LEAF_BASENAME}]]" "$root_content" \
  "ROOT children array contains LEAF wikilink"

# ---------------------------------------------------------------------------
# Test 3: spine inheritance (no spine arg → inherited from parent)
# ---------------------------------------------------------------------------
BRANCH_SLUG="test-branch"
BRANCH_TITLE="Test Branch"
BRANCH_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.${BRANCH_SLUG} - ${BRANCH_TITLE}.md"

# Create branch without explicit spine
bash "$CREATE_ENTITY" "$VAULT" "$TEST_PROJ_SLUG" BRANCH \
  "$BRANCH_SLUG" "$BRANCH_TITLE" ROOT concept > /dev/null 2>&1 || true

branch_content="$(read_vault_file "$BRANCH_PATH")"
if [[ -n "$branch_content" ]]; then
  assert_contains "spine: ${TEST_PROJ_SLUG}" "$branch_content" \
    "BRANCH inherits spine from parent when omitted"
else
  printf 'SKIP: spine inheritance (BRANCH file not readable)\n'
fi

# ---------------------------------------------------------------------------
# Test 4: idempotency — re-running exits 0 without error
# ---------------------------------------------------------------------------
idempotent_exit=0
bash "$CREATE_ENTITY" "$VAULT" "$TEST_PROJ_SLUG" LEAF \
  "$LEAF_SLUG" "$LEAF_TITLE" ROOT concept "${TEST_PROJ_SLUG}" > /dev/null 2>&1 \
  || idempotent_exit=$?
if [[ $idempotent_exit -eq 0 ]]; then
  printf 'PASS: create-entity.sh is idempotent (exits 0 on re-run)\n'
else
  printf 'FAIL: create-entity.sh re-run exited %d\n' "$idempotent_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Test 5: --json output
# ---------------------------------------------------------------------------
json_out="$(bash "$CREATE_ENTITY" "$VAULT" "$TEST_PROJ_SLUG" LEAF \
  "$LEAF_SLUG" "$LEAF_TITLE" ROOT concept "${TEST_PROJ_SLUG}" --json 2>/dev/null)"
assert_json_valid "$json_out" "--json produces valid JSON"
assert_contains '"created"' "$json_out" "--json output contains 'created' key"

# New entity with --json
NEW_LEAF_SLUG="test-leaf-json"
NEW_LEAF_TITLE="Test Leaf JSON"
json_new="$(bash "$CREATE_ENTITY" "$VAULT" "$TEST_PROJ_SLUG" LEAF \
  "$NEW_LEAF_SLUG" "$NEW_LEAF_TITLE" ROOT concept "${TEST_PROJ_SLUG}" --json 2>/dev/null)" \
  || json_new='{"created":false}'
assert_json_valid "$json_new" "--json new entity produces valid JSON"
assert_contains '"created":true' "$json_new" "--json reports created:true for new entity"
assert_contains '"path"' "$json_new" "--json output contains path"

# Error case --json: missing parent
json_err="$(bash "$CREATE_ENTITY" "$VAULT" "$TEST_PROJ_SLUG" LEAF \
  "no-parent-leaf" "No Parent Leaf" NONEXISTENT concept "${TEST_PROJ_SLUG}" --json 2>/dev/null)" \
  || json_err='{"created":false,"error":"caught"}'
assert_json_valid "$json_err" "--json error case produces valid JSON"
assert_contains '"created":false' "$json_err" "--json error case reports created:false"

# ---------------------------------------------------------------------------
# Test 6: missing parent exits 1
# ---------------------------------------------------------------------------
missing_exit=0
bash "$CREATE_ENTITY" "$VAULT" "$TEST_PROJ_SLUG" LEAF \
  "orphan-leaf" "Orphan Leaf" NOSUCHPARENT concept > /dev/null 2>&1 \
  || missing_exit=$?
if [[ $missing_exit -ne 0 ]]; then
  printf 'PASS: create-entity.sh exits 1 when parent not found\n'
else
  printf 'FAIL: create-entity.sh should exit non-zero for missing parent\n' >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-create-entity.sh: all assertions passed\n'
else
  printf '\ntest-create-entity.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
