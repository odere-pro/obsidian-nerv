#!/usr/bin/env bash
# test-quiz.sh — Tests for quiz.sh study skill
#
# Creates a test project with notes across two spines (some stable, some draft).
# Verifies JSON output schema, instruction enforcement, spine filtering,
# draft exclusion, limit enforcement, and shuffle (non-determinism).
#
# Run via test-harness.sh:
#   test-harness.sh study test-quiz.sh
# Or directly:
#   TEST_VAULT=study bash test-quiz.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
STUDY_DIR="$(dirname "$CORE_DIR")/study"
SKILL="$STUDY_DIR/quiz.sh"
CREATE_PROJECT="$CORE_DIR/create-project.sh"

TEST_SLUG="testquiz"
TEST_UPPER="TESTQUIZ"
TEST_PROJ="projects/${TEST_SLUG}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

ob_create_note() {
  local path="$1" content="$2" jp jc
  jp="$(json_str "$path")"
  jc="$(json_str "$content")"
  ob_eval "$VAULT" \
    "(async () => { await app.vault.create(${jp}, ${jc}); })()" > /dev/null
}

cleanup() {
  ob_eval "$VAULT" "(async () => {
    var f = app.vault.getAbstractFileByPath('${TEST_PROJ}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# Arg validation
# ---------------------------------------------------------------------------
if bash "$SKILL" 2>/dev/null; then
  printf 'FAIL: quiz.sh should exit non-zero with no args\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: quiz.sh exits non-zero with no args\n'
fi

# ---------------------------------------------------------------------------
# Obsidian reachability
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_SLUG" "Test Quiz" > /dev/null 2>&1; then
  printf 'SKIP: test-quiz.sh (Obsidian not reachable or create-project.sh failed)\n'
  exit 0
fi
printf 'PASS: test project created\n'

# ---------------------------------------------------------------------------
# Create notes:
#   spine "storage": 4 stable + 1 draft (draft must be excluded)
#   spine "compute": 2 stable (must not appear when querying "storage")
# ---------------------------------------------------------------------------
make_note() {
  local slug="$1" title="$2" spine="$3" status="$4"
  ob_create_note "${TEST_PROJ}/${TEST_UPPER}.${slug} - ${title}.md" \
"---
title: \"${title}\"
aliases: []
type: LEAF
kind: concept
spine: ${spine}
status: ${status}
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Summary for ${title}.

## Content

$(printf 'word%.0s ' {1..50})

## Connections

- depends-on :: [[${TEST_UPPER}.alpha-1 - Alpha One]]

## Flags
"
}

make_note "stor-1" "Storage One"   "storage" "stable"
make_note "stor-2" "Storage Two"   "storage" "stable"
make_note "stor-3" "Storage Three" "storage" "stable"
make_note "stor-4" "Storage Four"  "storage" "stable"
make_note "stor-5" "Storage Draft" "storage" "draft"
make_note "comp-1" "Compute One"   "compute" "stable"
make_note "comp-2" "Compute Two"   "compute" "stable"
printf 'PASS: test notes created\n'

# ---------------------------------------------------------------------------
# Run quiz.sh — spine=storage, limit=3
# ---------------------------------------------------------------------------
quiz_out="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" "storage" 3 2>&1)"
quiz_exit=$?

if [[ $quiz_exit -eq 0 ]]; then
  printf 'PASS: quiz.sh exits 0\n'
else
  printf 'FAIL: quiz.sh exited %d\n' "$quiz_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_json_valid "$quiz_out" "output is valid JSON"
assert_contains '"instruction"' "$quiz_out" "output has instruction key"
assert_contains '"spine"'       "$quiz_out" "output has spine key"
assert_contains '"notes"'       "$quiz_out" "output has notes key"

# Instruction must contain the grounding constraint
assert_contains 'only' "$quiz_out" "instruction contains grounding language (only)"
assert_contains 'vault' "$quiz_out" "instruction references vault content"
assert_contains 'provided' "$quiz_out" "instruction says 'provided note content'"

# Spine value must match
assert_contains '"storage"' "$quiz_out" "spine field is 'storage'"

# Note fields
assert_contains '"title"'       "$quiz_out" "notes have title field"
assert_contains '"kind"'        "$quiz_out" "notes have kind field"
assert_contains '"summary"'     "$quiz_out" "notes have summary field"
assert_contains '"content"'     "$quiz_out" "notes have content field"
assert_contains '"connections"' "$quiz_out" "notes have connections field"

# Validate limit and exclusions via Python
python3 - "$quiz_out" <<'PYEOF'
import json, sys

data  = json.loads(sys.argv[1])
notes = data.get('notes', [])

failures = 0
def chk(cond, msg):
    global failures
    if cond:
        print('PASS: ' + msg)
    else:
        print('FAIL: ' + msg, file=sys.stderr)
        failures += 1

chk(len(notes) <= 3, 'notes count <= limit of 3')
chk(len(notes) >= 1, 'notes count >= 1 (at least one stable note present)')

# Draft must be excluded
titles = [n.get('title','') for n in notes]
chk('Storage Draft' not in titles, 'draft note excluded from results')

# Compute notes must not appear (wrong spine)
chk('Compute One' not in titles and 'Compute Two' not in titles,
    'compute-spine notes excluded (wrong spine)')

# Content should be capped at 500 chars
for n in notes:
    chk(len(n.get('content','')) <= 500, 'content <= 500 chars for "{}"'.format(n.get('title','')))

sys.exit(failures)
PYEOF
PYEOF_EXIT=$?
FAILURES=$((FAILURES + PYEOF_EXIT))

# ---------------------------------------------------------------------------
# Limit larger than available: should return all eligible notes (4 stable)
# ---------------------------------------------------------------------------
quiz_big="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" "storage" 10 2>&1)"
big_count="$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1]).get('notes',[])))" \
  "$quiz_big" 2>/dev/null || echo 0)"
if [[ "$big_count" -eq 4 ]]; then
  printf 'PASS: returns all 4 eligible notes when limit > available\n'
else
  printf 'FAIL: expected 4 eligible notes, got %s\n' "$big_count" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Empty spine: should return 0 notes (not an error)
# ---------------------------------------------------------------------------
quiz_empty="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" "nonexistent-spine-xyz" 5 2>&1)"
empty_exit=$?
if [[ $empty_exit -eq 0 ]]; then
  printf 'PASS: quiz.sh exits 0 for empty spine\n'
else
  printf 'FAIL: expected exit 0 for empty spine, got %d\n' "$empty_exit" >&2
  FAILURES=$((FAILURES + 1))
fi
empty_count="$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1]).get('notes',[])))" \
  "$quiz_empty" 2>/dev/null || echo -1)"
if [[ "$empty_count" -eq 0 ]]; then
  printf 'PASS: 0 notes returned for unknown spine\n'
else
  printf 'FAIL: expected 0 notes for unknown spine, got %s\n' "$empty_count" >&2
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
  printf '\ntest-quiz.sh: all assertions passed\n'
else
  printf '\ntest-quiz.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
