#!/usr/bin/env bash
# test-progress.sh — Tests for progress.sh study skill
#
# Creates a test project with notes of known status, word count, and edge
# count, then validates: JSON output schema, status counts, completion %,
# knowledge metrics, thisWeek list, and --format compact output.
#
# Run via test-harness.sh:
#   test-harness.sh study test-progress.sh
# Or directly:
#   TEST_VAULT=study bash test-progress.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
STUDY_DIR="$(dirname "$CORE_DIR")/study"
SKILL="$STUDY_DIR/progress.sh"
CREATE_PROJECT="$CORE_DIR/create-project.sh"

TEST_SLUG="testprog"
TEST_UPPER="TESTPROG"
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
  printf 'FAIL: progress.sh should exit non-zero with no args\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: progress.sh exits non-zero with no args\n'
fi

# ---------------------------------------------------------------------------
# Obsidian reachability
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_SLUG" "Test Progress" > /dev/null 2>&1; then
  printf 'SKIP: test-progress.sh (Obsidian not reachable or create-project.sh failed)\n'
  exit 0
fi
printf 'PASS: test project created\n'

# ---------------------------------------------------------------------------
# Create notes with known properties:
#   2 stable, 1 review, 1 draft
#   Each content block has exactly 20 unique words (easy to count)
#   Note A has 1 typed edge; Note B has 2 typed edges; others have 0
# ---------------------------------------------------------------------------
ob_create_note "${TEST_PROJ}/${TEST_UPPER}.note-a - Note A.md" \
"---
title: \"Note A\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: stable
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Note A summary text here.

## Content

alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango

## Connections

- depends-on :: [[${TEST_UPPER}.note-b - Note B]]

## Flags
"

ob_create_note "${TEST_PROJ}/${TEST_UPPER}.note-b - Note B.md" \
"---
title: \"Note B\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: stable
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Note B summary text here.

## Content

alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango

## Connections

- implements :: [[${TEST_UPPER}.note-a - Note A]]
- related-to :: [[${TEST_UPPER}.note-c - Note C]]

## Flags
"

ob_create_note "${TEST_PROJ}/${TEST_UPPER}.note-c - Note C.md" \
"---
title: \"Note C\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: review
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Note C summary text here.

## Content

alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango

## Connections

## Flags
"

ob_create_note "${TEST_PROJ}/${TEST_UPPER}.note-d - Note D.md" \
"---
title: \"Note D\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Note D summary text here.

## Content

alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango

## Connections

## Flags
"

printf 'PASS: test notes created\n'

# ---------------------------------------------------------------------------
# Run progress.sh (JSON output)
# ---------------------------------------------------------------------------
prog_out="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" 2>&1)"
prog_exit=$?

if [[ $prog_exit -eq 0 ]]; then
  printf 'PASS: progress.sh exits 0\n'
else
  printf 'FAIL: progress.sh exited %d\n' "$prog_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_json_valid "$prog_out" "JSON output is valid"
assert_contains '"project"'    "$prog_out" "output has project key"
assert_contains '"notes"'      "$prog_out" "output has notes key"
assert_contains '"completion"' "$prog_out" "output has completion key"
assert_contains '"knowledge"'  "$prog_out" "output has knowledge key"
assert_contains '"thisWeek"'   "$prog_out" "output has thisWeek key"
assert_contains '"totalWords"'      "$prog_out" "knowledge has totalWords"
assert_contains '"totalEdges"'      "$prog_out" "knowledge has totalEdges"
assert_contains '"avgEdgesPerNote"' "$prog_out" "knowledge has avgEdgesPerNote"

# Validate counts via Python
python3 - "$prog_out" "$TEST_SLUG" <<'PYEOF'
import json, sys

data   = json.loads(sys.argv[1])
slug   = sys.argv[2]
notes  = data.get('notes', {})
know   = data.get('knowledge', {})

failures = 0
def chk(cond, msg):
    global failures
    if cond:
        print('PASS: ' + msg)
    else:
        print('FAIL: ' + msg, file=sys.stderr)
        failures += 1

chk(data.get('project') == slug,    'project field matches slug')
chk(notes.get('total')  == 4,       'total == 4')
chk(notes.get('stable') == 2,       'stable == 2')
chk(notes.get('review') == 1,       'review == 1')
chk(notes.get('draft')  == 1,       'draft == 1')

# completion = 2/4 * 100 = 50.0
chk(data.get('completion') == 50.0, 'completion == 50.0')

# totalEdges = 1 (note-a) + 2 (note-b) + 0 + 0 = 3
chk(know.get('totalEdges') == 3,    'totalEdges == 3')

# avgEdgesPerNote = 3/4 = 0.75 → rounded to 1dp = 0.8
chk(know.get('avgEdgesPerNote') == 0.8, 'avgEdgesPerNote == 0.8')

# thisWeek: all notes were just created, should all appear
this_week = data.get('thisWeek', [])
chk(len(this_week) == 4, 'thisWeek includes all 4 freshly-created notes')

sys.exit(failures)
PYEOF
PYEOF_EXIT=$?
FAILURES=$((FAILURES + PYEOF_EXIT))

# ---------------------------------------------------------------------------
# --format compact
# ---------------------------------------------------------------------------
compact_out="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" --format compact 2>&1)"
compact_exit=$?

if [[ $compact_exit -eq 0 ]]; then
  printf 'PASS: --format compact exits 0\n'
else
  printf 'FAIL: --format compact exited %d\n' "$compact_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

# Compact output must be a single line containing the slug
assert_contains "$TEST_SLUG" "$compact_out" "compact output contains project slug"
assert_contains "notes"      "$compact_out" "compact output contains 'notes'"
assert_contains "stable"     "$compact_out" "compact output contains 'stable'"
assert_contains "edges"      "$compact_out" "compact output contains 'edges'"

line_count="$(printf '%s' "$compact_out" | wc -l | tr -d ' ')"
if [[ "$line_count" -le 1 ]]; then
  printf 'PASS: compact output is a single line\n'
else
  printf 'FAIL: compact output should be 1 line (got %s)\n' "$line_count" >&2
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
  printf '\ntest-progress.sh: all assertions passed\n'
else
  printf '\ntest-progress.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
