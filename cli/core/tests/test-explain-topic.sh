#!/usr/bin/env bash
# test-explain-topic.sh — Tests for explain-topic.sh sensory skill
#
# Creates a small project: one ROOT, one BRANCH (parent=ROOT), two LEAF
# siblings (parent=BRANCH), one of which has a typed connection to the
# other.  Runs explain-topic.sh against the connected LEAF and validates
# the primary / parent / siblings / connected structure.
#
# Run via test-harness.sh:
#   test-harness.sh study test-explain-topic.sh
# Or directly:
#   TEST_VAULT=study bash test-explain-topic.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
SKILL="$(dirname "$SCRIPT_DIR")/explain-topic.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testexpl"
TEST_UPPER="TESTEXPL"
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
  printf 'FAIL: explain-topic.sh should exit non-zero with no args\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: explain-topic.sh exits non-zero with no args\n'
fi

# ---------------------------------------------------------------------------
# Obsidian reachability check
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_SLUG" "Test Explain Topic" > /dev/null 2>&1; then
  printf 'SKIP: test-explain-topic.sh (Obsidian not reachable or create-project.sh failed)\n'
  exit 0
fi
printf 'PASS: test project created\n'

# ---------------------------------------------------------------------------
# Build note hierarchy:
#   ROOT (domain-root)
#   └── BRANCH (domain-branch)
#       ├── LEAF primary (has connection to sibling-b)
#       └── LEAF sibling-b (target of primary's connection)
# ---------------------------------------------------------------------------
ROOT_NAME="${TEST_UPPER}.domain-root - Domain Root"
BRANCH_NAME="${TEST_UPPER}.domain-branch - Domain Branch"
PRIMARY_NAME="${TEST_UPPER}.primary-leaf - Primary Leaf"
SIBLING_NAME="${TEST_UPPER}.sibling-leaf - Sibling Leaf"

# ROOT
ob_create_note "${TEST_PROJ}/${ROOT_NAME}.md" \
"---
title: \"Domain Root\"
aliases: [\"domain root\"]
type: ROOT
kind: domain
spine: ${TEST_SLUG}
status: active
parent: \"\"
children: [\"[[${BRANCH_NAME}]]\"]
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Root summary content.

## Content

$(printf 'word%.0s ' {1..50})

## Connections

- depends-on :: [[${BRANCH_NAME}]]

## Flags
"

# BRANCH
ob_create_note "${TEST_PROJ}/${BRANCH_NAME}.md" \
"---
title: \"Domain Branch\"
aliases: [\"domain branch\"]
type: BRANCH
kind: topic
spine: ${TEST_SLUG}
status: active
parent: \"[[${ROOT_NAME}]]\"
children: [\"[[${PRIMARY_NAME}]]\", \"[[${SIBLING_NAME}]]\"]
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

Domain Root > Domain Branch

## Summary

Branch summary content.

## Content

$(printf 'word%.0s ' {1..50})

## Connections

- depends-on :: [[${ROOT_NAME}]]

## Flags
"

# PRIMARY LEAF (connects to sibling)
ob_create_note "${TEST_PROJ}/${PRIMARY_NAME}.md" \
"---
title: \"Primary Leaf\"
aliases: [\"primary leaf\", \"primary topic\"]
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: active
parent: \"[[${BRANCH_NAME}]]\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

Domain Root > Domain Branch > Primary Leaf

## Summary

Primary leaf summary content.

## Content

$(printf 'word%.0s ' {1..110})

## Connections

- depends-on :: [[${SIBLING_NAME}]]

## Flags
"

# SIBLING LEAF
ob_create_note "${TEST_PROJ}/${SIBLING_NAME}.md" \
"---
title: \"Sibling Leaf\"
aliases: [\"sibling leaf\"]
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: active
parent: \"[[${BRANCH_NAME}]]\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Breadcrumb

Domain Root > Domain Branch > Sibling Leaf

## Summary

Sibling leaf summary content.

## Content

$(printf 'word%.0s ' {1..110})

## Connections

## Flags
"

printf 'PASS: test notes created\n'

# Give Obsidian metadata cache time to index the new notes
sleep 2

# ---------------------------------------------------------------------------
# Run explain-topic.sh for the primary leaf
# ---------------------------------------------------------------------------
expl_out="$(bash "$SKILL" "$VAULT" "primary leaf" 2>&1)"
expl_exit=$?

if [[ $expl_exit -eq 0 ]]; then
  printf 'PASS: explain-topic.sh exits 0\n'
else
  printf 'FAIL: explain-topic.sh exited %d\n' "$expl_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_json_valid "$expl_out" "output is valid JSON"

# Top-level keys
assert_contains '"primary"'   "$expl_out" "output has primary key"
assert_contains '"parent"'    "$expl_out" "output has parent key"
assert_contains '"siblings"'  "$expl_out" "output has siblings key"
assert_contains '"connected"' "$expl_out" "output has connected key"

# Primary: must contain entity detail fields
assert_contains '"path"'        "$expl_out" "primary has path"
assert_contains '"frontmatter"' "$expl_out" "primary has frontmatter"
assert_contains '"sections"'    "$expl_out" "primary has sections"
assert_contains '"backlinks"'   "$expl_out" "primary has backlinks"
assert_contains '"outgoing"'    "$expl_out" "primary has outgoing"

# Primary title should identify the note
assert_contains 'Primary Leaf' "$expl_out" "primary title matches queried note"

# Parent: should be Domain Branch
assert_contains 'Domain Branch' "$expl_out" "parent is Domain Branch"
assert_contains '"summary"' "$expl_out" "parent has summary field"

# Siblings: Sibling Leaf shares the same parent (Domain Branch)
assert_contains 'Sibling Leaf' "$expl_out" "siblings includes Sibling Leaf"

# Connected: Primary connects to Sibling via depends-on
assert_contains '"rel"'       "$expl_out" "connected entries have rel field"
assert_contains '"kind"'      "$expl_out" "connected entries have kind field"
assert_contains 'depends-on'  "$expl_out" "connected includes depends-on relationship"

# Sibling should appear in connected (it's the target of Primary's connection)
assert_contains 'Sibling' "$expl_out" "connected includes the sibling target note"

# ---------------------------------------------------------------------------
# ROOT note: parent should be null
# ---------------------------------------------------------------------------
root_out="$(bash "$SKILL" "$VAULT" "domain root" 2>&1)"
root_exit=$?

if [[ $root_exit -eq 0 ]]; then
  printf 'PASS: explain-topic.sh exits 0 for ROOT note\n'
else
  printf 'FAIL: explain-topic.sh exited %d for ROOT note\n' "$root_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_json_valid "$root_out" "ROOT query output is valid JSON"

root_parent="$(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
print(json.dumps(d.get('parent')))
" "$root_out" 2>/dev/null || echo 'ERROR')"

if [[ "$root_parent" == "null" ]]; then
  printf 'PASS: parent is null for ROOT note\n'
else
  printf 'FAIL: parent should be null for ROOT note (got: %s)\n' "$root_parent" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# No match: should exit 1
# ---------------------------------------------------------------------------
if bash "$SKILL" "$VAULT" "xyzzy-nonexistent-8473628" 2>/dev/null; then
  printf 'FAIL: explain-topic.sh should exit 1 for unmatched query\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: explain-topic.sh exits 1 for unmatched query\n'
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-explain-topic.sh: all assertions passed\n'
else
  printf '\ntest-explain-topic.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
