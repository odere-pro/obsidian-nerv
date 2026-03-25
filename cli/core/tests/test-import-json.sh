#!/usr/bin/env bash
# test-import-json.sh — Tests for import-json.sh motor skill
#
# Verifies: note created with correct filename and frontmatter, extra JSON
# properties passed through via processFrontMatter, idempotency (re-run
# reports Skipped: 1), notes with missing name are skipped.
#
# Run via test-harness.sh:
#   test-harness.sh study test-import-json.sh
# Or directly:
#   TEST_VAULT=study bash test-import-json.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
SKILL="$(dirname "$SCRIPT_DIR")/import-json.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_PROJ_SLUG="testimp"
TEST_PROJ_TITLE="Test Import Project"
TEST_PROJ_UPPER="TESTIMP"
TEST_PROJ_DIR="projects/${TEST_PROJ_SLUG}"

# Note produced by the primary test case
NOTE_NAME="TestImport"
NOTE_SLUG="testimport"
NOTE_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.${NOTE_SLUG} - ${NOTE_NAME}.md"

# Temporary JSON files (cleaned up in cleanup())
JSON_FILE="$(mktemp /tmp/test-import-json-XXXXXX.json)"
JSON_FILE_EXTRA="$(mktemp /tmp/test-import-json-extra-XXXXXX.json)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

file_exists_in_vault() {
  local path="$1"
  local js_path result
  js_path="$(json_str "$path")"
  result="$(ob_eval "$VAULT" \
    "app.vault.getAbstractFileByPath(${js_path}) ? 'yes' : 'no'" \
    2>/dev/null)" || result="no"
  printf '%s' "$result"
}

read_vault_file() {
  local path="$1"
  local js_path
  js_path="$(json_str "$path")"
  ob_eval "$VAULT" \
    "(async () => { const f = app.vault.getAbstractFileByPath(${js_path}); return f ? await app.vault.cachedRead(f) : ''; })()" \
    2>/dev/null || true
}

read_frontmatter_field() {
  local path="$1" field="$2"
  local js_path
  js_path="$(json_str "$path")"
  ob_eval "$VAULT" \
    "(()=>{ const f=app.vault.getAbstractFileByPath(${js_path}); const fm=app.metadataCache.getFileCache(f)?.frontmatter??{}; return String(fm['${field}']??''); })()" \
    2>/dev/null || true
}

cleanup() {
  ob_eval "$VAULT" "(async () => {
    const f = app.vault.getAbstractFileByPath('${TEST_PROJ_DIR}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
  rm -f "$JSON_FILE" "$JSON_FILE_EXTRA"
  printf 'INFO: test project trashed and temp files removed (cleanup)\n'
}

# ---------------------------------------------------------------------------
# Ensure clean slate
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Create test project — skip all tests if Obsidian is unreachable
# ---------------------------------------------------------------------------
if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_PROJ_SLUG" "$TEST_PROJ_TITLE" > /dev/null 2>&1; then
  printf 'SKIP: test-import-json.sh (Obsidian not reachable or create-project.sh failed)\n'
  rm -f "$JSON_FILE" "$JSON_FILE_EXTRA"
  exit 0
fi
printf 'PASS: test project created\n'

# ---------------------------------------------------------------------------
# Write primary test JSON (standard schema fields only)
# ---------------------------------------------------------------------------
printf '[{"name":"TestImport","kind":"concept","spine":"test","type":"LEAF"}]' > "$JSON_FILE"

# ---------------------------------------------------------------------------
# Run import-json.sh
# ---------------------------------------------------------------------------
import_out="$(bash "$SKILL" "$VAULT" "$TEST_PROJ_SLUG" "$JSON_FILE" "tpl-leaf" 2>&1)"
import_exit=$?

if [[ $import_exit -eq 0 ]]; then
  printf 'PASS: import-json.sh exits 0\n'
else
  printf 'FAIL: import-json.sh exited %d\n  output: %s\n' "$import_exit" "$import_out" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Verify the note was created with the correct filename
# ---------------------------------------------------------------------------
assert_eq "yes" "$(file_exists_in_vault "$NOTE_PATH")" \
  "note created at correct path: ${NOTE_PATH}"

# ---------------------------------------------------------------------------
# Verify frontmatter fields
# ---------------------------------------------------------------------------
note_content="$(read_vault_file "$NOTE_PATH")"

for field_val in \
    "type: LEAF" \
    "kind: concept" \
    "spine: test" \
    "status: draft" \
    "created:" \
    "modified:" \
    "children: []"; do
  assert_contains "$field_val" "$note_content" "frontmatter contains '${field_val}'"
done

# ---------------------------------------------------------------------------
# Verify output reports Created: 1, Skipped: 0
# ---------------------------------------------------------------------------
assert_contains "Created: 1" "$import_out" "output reports Created: 1"
assert_contains "Skipped: 0" "$import_out" "output reports Skipped: 0"

# ---------------------------------------------------------------------------
# Idempotency — re-run reports Skipped: 1, Created: 0
# ---------------------------------------------------------------------------
idempotent_out="$(bash "$SKILL" "$VAULT" "$TEST_PROJ_SLUG" "$JSON_FILE" "tpl-leaf" 2>&1)"
idempotent_exit=$?

if [[ $idempotent_exit -eq 0 ]]; then
  printf 'PASS: import-json.sh is idempotent (exits 0 on re-run)\n'
else
  printf 'FAIL: import-json.sh re-run exited %d\n' "$idempotent_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_contains "Created: 0" "$idempotent_out" "idempotent re-run reports Created: 0"
assert_contains "Skipped: 1" "$idempotent_out" "idempotent re-run reports Skipped: 1"

# ---------------------------------------------------------------------------
# Extra properties pass-through via processFrontMatter
# ---------------------------------------------------------------------------
EXTRA_NOTE_NAME="ExtraProps"
EXTRA_NOTE_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.extraprops - ${EXTRA_NOTE_NAME}.md"

printf '[{"name":"ExtraProps","type":"LEAF","kind":"concept","spine":"test","custom-tag":"alpha","priority":1}]' \
  > "$JSON_FILE_EXTRA"

bash "$SKILL" "$VAULT" "$TEST_PROJ_SLUG" "$JSON_FILE_EXTRA" "tpl-leaf" > /dev/null 2>&1

assert_eq "yes" "$(file_exists_in_vault "$EXTRA_NOTE_PATH")" \
  "extra-props note created"

extra_custom="$(read_frontmatter_field "$EXTRA_NOTE_PATH" "custom-tag")"
if [[ "$extra_custom" == "alpha" ]]; then
  printf 'PASS: extra JSON property "custom-tag" written to frontmatter\n'
else
  printf 'FAIL: extra JSON property "custom-tag" — expected "alpha", got "%s"\n' \
    "$extra_custom" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Missing name field — entry is skipped, not a fatal error
# ---------------------------------------------------------------------------
JSON_FILE_NONAME="$(mktemp /tmp/test-import-json-noname-XXXXXX.json)"
printf '[{"type":"LEAF","kind":"concept","spine":"test"}]' > "$JSON_FILE_NONAME"

noname_out="$(bash "$SKILL" "$VAULT" "$TEST_PROJ_SLUG" "$JSON_FILE_NONAME" "tpl-leaf" 2>&1)"
noname_exit=$?
rm -f "$JSON_FILE_NONAME"

if [[ $noname_exit -eq 0 ]]; then
  printf 'PASS: import-json.sh exits 0 when name field is missing\n'
else
  printf 'FAIL: import-json.sh exited %d for missing name (expected 0)\n' "$noname_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_contains "Skipped: 1" "$noname_out" "missing-name entry counted as skipped"

# ---------------------------------------------------------------------------
# Missing project — exits 1 with an error message
# ---------------------------------------------------------------------------
no_project_out="$(bash "$SKILL" "$VAULT" "no-such-project-xyz" "$JSON_FILE" "tpl-leaf" 2>&1)"
no_project_exit=$?

if [[ $no_project_exit -ne 0 ]]; then
  printf 'PASS: import-json.sh exits non-zero for missing project\n'
else
  printf 'FAIL: import-json.sh should exit non-zero for missing project (got 0)\n' >&2
  FAILURES=$((FAILURES + 1))
fi

assert_contains "not found" "$no_project_out" \
  "missing-project error message contains 'not found'"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-import-json.sh: all assertions passed\n'
else
  printf '\ntest-import-json.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
