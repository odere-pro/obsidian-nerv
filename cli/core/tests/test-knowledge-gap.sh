#!/usr/bin/env bash
# test-knowledge-gap.sh — Tests for get-knowledge-gap.sh sensory skill
#
# Creates a test project with deliberately deficient notes, runs
# get-knowledge-gap.sh, and validates each gap category in the JSON output.
#
# Gap categories exercised:
#   stubs          — note with < 100 body words
#   noConnections  — note with no typed connections
#   drafts         — note with status: draft
#   missingFields  — note with missing required frontmatter fields
#   lowLinkCount   — ROOT note with 0 typed connections
#   unresolvedLinks — note with a wikilink to a non-existent note
#
# Run via test-harness.sh:
#   test-harness.sh study test-knowledge-gap.sh
# Or directly:
#   TEST_VAULT=study bash test-knowledge-gap.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
SKILL="$(dirname "$SCRIPT_DIR")/get-knowledge-gap.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testgap"
TEST_UPPER="TESTGAP"
TEST_PROJ="projects/${TEST_SLUG}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

ob_create_note() {
  local path="$1" content="$2" js_path js_content
  js_path="$(json_str "$path")"
  js_content="$(json_str "$content")"
  ob_eval "$VAULT" \
    "(async () => { await app.vault.create(${js_path}, ${js_content}); })()" \
    > /dev/null
}

cleanup() {
  ob_eval "$VAULT" "(async () => {
    var f = app.vault.getAbstractFileByPath('${TEST_PROJ}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# Arg validation (no Obsidian needed)
# ---------------------------------------------------------------------------
if bash "$SKILL" 2>/dev/null; then
  printf 'FAIL: get-knowledge-gap.sh should exit non-zero with no args\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: get-knowledge-gap.sh exits non-zero with no args\n'
fi

# ---------------------------------------------------------------------------
# Obsidian reachability check
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_SLUG" "Test Knowledge Gap" > /dev/null 2>&1; then
  printf 'SKIP: test-knowledge-gap.sh (Obsidian not reachable or create-project.sh failed)\n'
  exit 0
fi
printf 'PASS: test project created\n'

# ---------------------------------------------------------------------------
# Create notes with deliberate structural deficiencies
# ---------------------------------------------------------------------------

# 1. Stub note: < 100 words in body (minimal content)
ob_create_note "${TEST_PROJ}/${TEST_UPPER}.stub - Stub Note.md" \
"---
title: \"Stub Note\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: active
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Short.

## Content

Very sparse content here. Only a few words.

## Connections

## Flags
"

# 2. Root note with no connections (triggers noConnections + lowLinkCount)
ob_create_note "${TEST_PROJ}/${TEST_UPPER}.root-no-conn - Root No Conn.md" \
"---
title: \"Root No Conn\"
aliases: []
type: ROOT
kind: domain
spine: ${TEST_SLUG}
status: active
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

A root note with no typed connections.

## Content

$(printf 'word%.0s ' {1..110})

## Connections

## Flags
"

# 3. Draft note
ob_create_note "${TEST_PROJ}/${TEST_UPPER}.draft-note - Draft Note.md" \
"---
title: \"Draft Note\"
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

## Breadcrumb

## Summary

A draft note for testing.

## Content

$(printf 'word%.0s ' {1..110})

## Connections

- depends-on :: [[${TEST_UPPER}.root-no-conn - Root No Conn]]

## Flags
"

# 4. Missing-fields note (no kind, no spine)
ob_create_note "${TEST_PROJ}/${TEST_UPPER}.missing-fields - Missing Fields.md" \
"---
title: \"Missing Fields\"
aliases: []
type: LEAF
kind: \"\"
spine: \"\"
status: active
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

A note missing required fields.

## Content

$(printf 'word%.0s ' {1..110})

## Connections

- depends-on :: [[${TEST_UPPER}.root-no-conn - Root No Conn]]

## Flags
"

# 5. Unresolved-links note (links to a non-existent note)
ob_create_note "${TEST_PROJ}/${TEST_UPPER}.broken-links - Broken Links.md" \
"---
title: \"Broken Links\"
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: active
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

## Summary

A note with a broken wikilink.

## Content

$(printf 'word%.0s ' {1..110})

See also [[NonExistentNoteXYZ123]].

## Connections

- depends-on :: [[${TEST_UPPER}.root-no-conn - Root No Conn]]

## Flags
"

printf 'PASS: test notes created\n'

# Give the metadata cache a moment to update
sleep 1

# ---------------------------------------------------------------------------
# Run get-knowledge-gap.sh
# ---------------------------------------------------------------------------
gap_out="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" 2>&1)"
gap_exit=$?

if [[ $gap_exit -eq 0 ]]; then
  printf 'PASS: get-knowledge-gap.sh exits 0\n'
else
  printf 'FAIL: get-knowledge-gap.sh exited %d\n' "$gap_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_json_valid "$gap_out" "output is valid JSON"
assert_contains '"stubs"'          "$gap_out" "output has stubs key"
assert_contains '"noConnections"'  "$gap_out" "output has noConnections key"
assert_contains '"drafts"'         "$gap_out" "output has drafts key"
assert_contains '"missingFields"'  "$gap_out" "output has missingFields key"
assert_contains '"lowLinkCount"'   "$gap_out" "output has lowLinkCount key"
assert_contains '"unresolvedLinks"' "$gap_out" "output has unresolvedLinks key"

# --- Stubs ---
assert_contains '"words"'          "$gap_out" "stubs entries contain words count"
stub_count="$(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
print(len(d.get('stubs',[])))
" "$gap_out" 2>/dev/null || echo 0)"
if [[ "$stub_count" -ge 1 ]]; then
  printf 'PASS: at least 1 stub detected\n'
else
  printf 'FAIL: expected at least 1 stub, got %s\n' "$stub_count" >&2
  FAILURES=$((FAILURES + 1))
fi

# --- noConnections: root-no-conn has 0 connections ---
assert_contains 'root-no-conn' "$gap_out" "noConnections includes root-no-conn note"

# --- Drafts ---
assert_contains '"draft-note' "$gap_out" "drafts includes draft-note"

# --- missingFields ---
assert_contains '"kind"' "$gap_out" "missingFields reports missing kind field"

# --- lowLinkCount: ROOT with 0 connections < 2 ---
assert_contains 'root-no-conn' "$gap_out" "lowLinkCount includes ROOT with no connections"

# --- unresolvedLinks ---
assert_contains 'NonExistentNoteXYZ123' "$gap_out" "unresolvedLinks reports broken wikilink"

# ---------------------------------------------------------------------------
# Invalid project slug should error
# ---------------------------------------------------------------------------
if bash "$SKILL" "$VAULT" "INVALID_SLUG" 2>/dev/null; then
  printf 'FAIL: should reject invalid slug\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: invalid slug rejected\n'
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-knowledge-gap.sh: all assertions passed\n'
else
  printf '\ntest-knowledge-gap.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
