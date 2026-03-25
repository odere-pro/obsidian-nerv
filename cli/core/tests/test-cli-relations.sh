#!/usr/bin/env bash
# test-cli-relations.sh — Tests for cli-relations.sh reflex skill
#
# Verifies: edge extraction format, context capture, unknown-type warning,
# summary block (sorted descending), --json output shape, empty-project
# baseline, and folder-scope filtering.
#
# Run via test-harness.sh:
#   test-harness.sh study test-cli-relations.sh
# Or directly:
#   TEST_VAULT=study bash test-cli-relations.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
SKILL="$(dirname "$SCRIPT_DIR")/cli-relations.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_PROJ_SLUG="testrel"
TEST_PROJ_TITLE="Test Relations"
TEST_PROJ_UPPER="TESTREL"
TEST_PROJ_DIR="projects/${TEST_PROJ_SLUG}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

ob_create_note() {
  local path="$1" content="$2"
  local js_path js_content
  js_path="$(json_str "$path")"
  js_content="$(json_str "$content")"
  ob_eval "$VAULT" \
    "(async () => { await app.vault.create(${js_path}, ${js_content}); })()" \
    > /dev/null
}

cleanup() {
  ob_eval "$VAULT" "(async () => {
    const f = app.vault.getAbstractFileByPath('${TEST_PROJ_DIR}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
  printf 'INFO: test project trashed (cleanup)\n'
}

# ---------------------------------------------------------------------------
# Ensure clean slate
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Create test project — skip all tests if Obsidian is unreachable
# ---------------------------------------------------------------------------
if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_PROJ_SLUG" "$TEST_PROJ_TITLE" \
    > /dev/null 2>&1; then
  printf 'SKIP: test-cli-relations.sh (Obsidian not reachable or create-project.sh failed)\n'
  exit 0
fi
printf 'PASS: test project created\n'

# ---------------------------------------------------------------------------
# Create test notes with typed connections
#
# Note A: two known connections + one unknown type
# Note B: one known connection with context
# Note C: no connections (should appear in no edges)
# ---------------------------------------------------------------------------
NOTE_A_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.note-a - Note A.md"
NOTE_B_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.note-b - Note B.md"
NOTE_C_PATH="${TEST_PROJ_DIR}/${TEST_PROJ_UPPER}.note-c - Note C.md"

NOTE_A_CONTENT="---
title: \"Note A\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_PROJ_SLUG}
status: draft
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

## Content

## Connections

- depends-on :: [[${TEST_PROJ_UPPER}.note-b - Note B]]
- implements :: [[${TEST_PROJ_UPPER}.note-c - Note C]]
- mystery-rel :: [[${TEST_PROJ_UPPER}.note-c - Note C]]

## Flags
"

NOTE_B_CONTENT="---
title: \"Note B\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_PROJ_SLUG}
status: draft
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

## Content

## Connections

- depends-on :: [[${TEST_PROJ_UPPER}.note-c - Note C]] — load balancing dependency

## Flags
"

NOTE_C_CONTENT="---
title: \"Note C\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_PROJ_SLUG}
status: draft
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

## Content

## Connections

## Flags
"

ob_create_note "$NOTE_A_PATH" "$NOTE_A_CONTENT"
ob_create_note "$NOTE_B_PATH" "$NOTE_B_CONTENT"
ob_create_note "$NOTE_C_PATH" "$NOTE_C_CONTENT"
printf 'PASS: test notes created\n'

# ---------------------------------------------------------------------------
# Run cli-relations.sh (human-readable output, scoped to test project)
# ---------------------------------------------------------------------------
rel_out="$(bash "$SKILL" "$VAULT" "$TEST_PROJ_DIR" 2>&1)"
rel_exit=$?

if [[ $rel_exit -eq 0 ]]; then
  printf 'PASS: cli-relations.sh exits 0\n'
else
  printf 'FAIL: cli-relations.sh exited %d\n' "$rel_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Verify edge lines are emitted in correct format
# ---------------------------------------------------------------------------
assert_contains "--depends-on-->" "$rel_out" \
  "edge output contains '--depends-on-->'"
assert_contains "--implements-->" "$rel_out" \
  "edge output contains '--implements-->'"
assert_contains "--mystery-rel-->" "$rel_out" \
  "edge output contains '--mystery-rel-->'"

# ---------------------------------------------------------------------------
# Verify unknown relationship type warning is emitted
# ---------------------------------------------------------------------------
assert_contains "Unknown relationship type: 'mystery-rel'" "$rel_out" \
  "warning emitted for unknown relationship type 'mystery-rel'"

# ---------------------------------------------------------------------------
# Verify known types do NOT appear in warnings
# ---------------------------------------------------------------------------
if [[ "$rel_out" != *"Unknown relationship type: 'depends-on'"* ]] && \
   [[ "$rel_out" != *"Unknown relationship type: 'implements'"* ]]; then
  printf 'PASS: known relationship types do not produce warnings\n'
else
  printf 'FAIL: known types should not appear in unknown-type warnings\n' >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Verify summary block is present and sorted descending
# ---------------------------------------------------------------------------
assert_contains "Summary:" "$rel_out" "output contains Summary: block"
assert_contains "depends-on: 2" "$rel_out" "summary shows depends-on: 2"
assert_contains "implements: 1" "$rel_out" "summary shows implements: 1"

# depends-on (count 2) must appear before implements (count 1) in output
if [[ "${rel_out%%depends-on: 2*}" != "$rel_out" ]] && \
   [[ "${rel_out%%implements: 1*}" != "$rel_out" ]]; then
  dep_pos="${#rel_out%%depends-on: 2*}"
  imp_pos="${#rel_out%%implements: 1*}"
  if [[ $dep_pos -lt $imp_pos ]]; then
    printf 'PASS: summary is sorted descending (depends-on before implements)\n'
  else
    printf 'FAIL: summary not sorted descending\n' >&2
    FAILURES=$((FAILURES + 1))
  fi
fi

# ---------------------------------------------------------------------------
# Verify context is captured (Note B's connection has a context string)
# ---------------------------------------------------------------------------
assert_contains "load balancing dependency" "$rel_out" \
  "context string captured from connection line" || true
# Context appears in --json output; human output only shows edges without context
# so we verify it via JSON below

# ---------------------------------------------------------------------------
# Verify "Relations complete" summary line
# ---------------------------------------------------------------------------
assert_contains "Relations complete." "$rel_out" \
  "output ends with 'Relations complete.' line"

# ---------------------------------------------------------------------------
# --json output
# ---------------------------------------------------------------------------
json_out="$(bash "$SKILL" "$VAULT" "$TEST_PROJ_DIR" --json 2>&1)"

assert_json_valid "$json_out" "--json output is valid JSON"
assert_contains '"edges"'        "$json_out" "--json output contains edges key"
assert_contains '"summary"'      "$json_out" "--json output contains summary key"
assert_contains '"unknownTypes"' "$json_out" "--json output contains unknownTypes key"
assert_contains '"mystery-rel"'  "$json_out" "--json unknownTypes lists mystery-rel"

# Verify context is present in JSON edges
assert_contains '"context"' "$json_out" "--json edges include context field"
assert_contains "load balancing dependency" "$json_out" \
  "--json context value captured"

# ---------------------------------------------------------------------------
# Empty scope — no notes with connections should produce 0 edges gracefully
# ---------------------------------------------------------------------------
empty_out="$(bash "$SKILL" "$VAULT" "projects/nonexistent-xyz" 2>&1)"
empty_exit=$?
if [[ $empty_exit -eq 0 ]]; then
  printf 'PASS: cli-relations.sh exits 0 for empty/nonexistent scope\n'
else
  printf 'FAIL: expected exit 0 for empty scope (got %d)\n' "$empty_exit" >&2
  FAILURES=$((FAILURES + 1))
fi
assert_contains "Relations complete." "$empty_out" \
  "empty-scope run still emits Relations complete. line"

# ---------------------------------------------------------------------------
# Excluded file types must not appear as sources
# ---------------------------------------------------------------------------
assert_json_valid "$(bash "$SKILL" "$VAULT" "$TEST_PROJ_DIR" --json 2>&1)" \
  "JSON valid after exclusion check"

# Verify _ontology, _vocab, _topk, tpl- files are not in edge sources
no_excl_out="$(bash "$SKILL" "$VAULT" "$TEST_PROJ_DIR" --json 2>&1)"
for excl in "_ontology" "_vocab" "_topk" "tpl-"; do
  if [[ "$no_excl_out" != *"\"source\":\"${excl}"* ]]; then
    printf 'PASS: excluded prefix "%s" not present as edge source\n' "$excl"
  else
    printf 'FAIL: excluded prefix "%s" found as edge source\n' "$excl" >&2
    FAILURES=$((FAILURES + 1))
  fi
done

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-cli-relations.sh: all assertions passed\n'
else
  printf '\ntest-cli-relations.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
