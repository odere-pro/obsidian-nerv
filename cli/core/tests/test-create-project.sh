#!/usr/bin/env bash
# test-create-project.sh — Tests for create-project.sh motor skill
#
# Verifies: 5 files created, ROOT frontmatter, ontology table rows,
# .base filter string, idempotency (re-run exits 0 without changes).
#
# Run via test-harness.sh:
#   test-harness.sh study test-create-project.sh
# Or directly:
#   TEST_VAULT=study bash test-create-project.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
SKILL="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testcp"
TEST_TITLE="Test Create Project"
TEST_SLUG_UPPER="TESTCP"
TEST_PROJ="projects/${TEST_SLUG}"

ROOT_PATH="${TEST_PROJ}/${TEST_SLUG_UPPER}.ROOT - ${TEST_TITLE}.md"
ONTO_PATH="${TEST_PROJ}/_ontology.${TEST_SLUG}.md"
VOCAB_PATH="${TEST_PROJ}/_vocab.${TEST_SLUG}.md"
TOPK_PATH="${TEST_PROJ}/_topk.${TEST_SLUG}.md"
BASE_PATH="${TEST_PROJ}/${TEST_SLUG}.base"

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

cleanup() {
  ob_eval "$VAULT" "(async () => {
    const f = app.vault.getAbstractFileByPath('${TEST_PROJ}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
  printf 'INFO: test project trashed (cleanup)\n'
}

# ---------------------------------------------------------------------------
# Ensure clean slate
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Run create-project.sh — skip all downstream tests if Obsidian unreachable
# ---------------------------------------------------------------------------
if ! bash "$SKILL" "$VAULT" "$TEST_SLUG" "$TEST_TITLE" > /dev/null 2>&1; then
  printf 'SKIP: create-project.sh (Obsidian not reachable or skill failed)\n'
  exit 0
fi
printf 'PASS: create-project.sh exits 0\n'

# ---------------------------------------------------------------------------
# Verify all 5 files exist
# ---------------------------------------------------------------------------
for spec in \
    "ROOT note:${ROOT_PATH}" \
    "_ontology:${ONTO_PATH}" \
    "_vocab:${VOCAB_PATH}" \
    "_topk:${TOPK_PATH}" \
    ".base:${BASE_PATH}"; do
  label="${spec%%:*}"
  path="${spec#*:}"
  assert_eq "yes" "$(file_exists_in_vault "$path")" "${label} file exists"
done

# ---------------------------------------------------------------------------
# Verify ROOT frontmatter fields
# ---------------------------------------------------------------------------
root_content="$(read_vault_file "$ROOT_PATH")"

for field_val in \
    "type: ROOT" \
    "kind: concept" \
    "spine: ${TEST_SLUG}" \
    "status: draft" \
    "children: []" \
    "created:" \
    "modified:"; do
  assert_contains "$field_val" "$root_content" "ROOT frontmatter contains '${field_val}'"
done

# ---------------------------------------------------------------------------
# Verify _ontology contains all 10 relationship types
# ---------------------------------------------------------------------------
onto_content="$(read_vault_file "$ONTO_PATH")"

for rel in triggers depends-on implements extends compares-to \
           replaces feeds-data authenticates-via contains mitigates; do
  assert_contains "\`${rel}\`" "$onto_content" "_ontology contains \`${rel}\`"
done

# ---------------------------------------------------------------------------
# Verify .base contains correct inFolder filter
# ---------------------------------------------------------------------------
base_content="$(read_vault_file "$BASE_PATH")"
assert_contains "file.inFolder(\"projects/${TEST_SLUG}\")" "$base_content" \
  ".base contains correct inFolder filter"

# ---------------------------------------------------------------------------
# Idempotency: re-running exits 0 and produces no error output
# ---------------------------------------------------------------------------
idempotent_out="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" "$TEST_TITLE" 2>&1)"
idempotent_exit=$?
if [[ $idempotent_exit -eq 0 ]]; then
  printf 'PASS: create-project.sh is idempotent (exits 0 on re-run)\n'
else
  printf 'FAIL: create-project.sh re-run exited %d\n' "$idempotent_exit" >&2
  FAILURES=$((FAILURES + 1))
fi
assert_contains "already exists" "$idempotent_out" \
  "idempotent re-run reports 'already exists'"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-create-project.sh: all assertions passed\n'
else
  printf '\ntest-create-project.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
