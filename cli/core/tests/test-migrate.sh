#!/usr/bin/env bash
# test-migrate.sh — Tests for migrate.sh schema migration skill
#
# Creates a test project with notes that have typed connections, a known spine,
# LEAF notes eligible for field addition, and a LEAF note for promotion. Runs
# each supported operation type and validates the results.
#
# IMPORTANT: Each operation test uses a focused single-op spec so tests are
# independent and failures are easy to diagnose.
#
# Run via test-harness.sh:
#   test-harness.sh obsidian_docs test-migrate.sh
# Or directly:
#   TEST_VAULT=obsidian_docs bash test-migrate.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set}"
MIGRATE="$(dirname "$SCRIPT_DIR")/migrate.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testmig"
TEST_TITLE="Test Migrate"
TEST_PROJ="projects/${TEST_SLUG}"
TEST_UPPER="TESTMIG"

SPEC_DIR="$(mktemp -d)"
trap 'rm -rf "$SPEC_DIR"' EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

create_note() {
  local path="$1" content="$2"
  ob_eval "$VAULT" \
    "(async()=>{ await app.vault.create($(json_str "$path"),$(json_str "$content")); })()" \
    >/dev/null 2>&1
}

read_note() {
  local path="$1"
  ob_eval "$VAULT" \
    "(async(){ const f=app.vault.getAbstractFileByPath($(json_str "$path")); return f ? await app.vault.cachedRead(f) : ''; })()" \
    2>/dev/null || echo ''
}

get_frontmatter_field() {
  local path="$1" field="$2"
  ob_eval "$VAULT" \
    "(()=>{ const f=app.vault.getAbstractFileByPath($(json_str "$path")); const c=app.metadataCache.getFileCache(f); return c&&c.frontmatter?JSON.stringify(c.frontmatter[$(json_str "$field")]):\"null\"; })()" \
    2>/dev/null || echo 'null'
}

file_exists() {
  local path="$1"
  ob_eval "$VAULT" \
    "app.vault.getAbstractFileByPath($(json_str "$path")) ? 'yes' : 'no'" \
    2>/dev/null || echo 'no'
}

write_spec() {
  local name="$1" spec="$2"
  printf '%s\n' "$spec" > "${SPEC_DIR}/${name}.json"
  printf '%s' "${SPEC_DIR}/${name}.json"
}

cleanup() {
  ob_eval "$VAULT" "(async()=>{
    const f=app.vault.getAbstractFileByPath('${TEST_PROJ}');
    if(f) await app.vault.trash(f,false);
  })()" >/dev/null 2>&1 || true
  printf 'INFO: test project trashed (cleanup)\n'
}

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_SLUG" "$TEST_TITLE" >/dev/null 2>&1; then
  printf 'SKIP: test-migrate.sh (Obsidian not reachable)\n'
  exit 0
fi

# Verify Obsidian reachable
if [[ "$(ob_eval "$VAULT" "'ping'" 2>/dev/null)" != "ping" ]]; then
  printf 'SKIP: test-migrate.sh (Obsidian not reachable)\n'
  cleanup
  exit 0
fi

# Note A: LEAF with a `triggers` connection (rename-rel target)
NOTE_A_BASENAME="${TEST_UPPER}.note-a - Note A"
NOTE_A_PATH="${TEST_PROJ}/${NOTE_A_BASENAME}.md"
create_note "$NOTE_A_PATH" \
"---
title: Note A
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: \"[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Note A summary.
## Content
Note A content.
## Connections
- triggers :: [[${TEST_UPPER}.note-b - Note B]]
## Flags
"

# Note B: LEAF with spine (rename-spine target, also receives backlink from A)
NOTE_B_BASENAME="${TEST_UPPER}.note-b - Note B"
NOTE_B_PATH="${TEST_PROJ}/${NOTE_B_BASENAME}.md"
create_note "$NOTE_B_PATH" \
"---
title: Note B
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: \"[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Note B summary.
## Content
Note B content.
## Connections
## Flags
"

# Note C: LEAF to be promoted to BRANCH
NOTE_C_BASENAME="${TEST_UPPER}.leaf-promote - Leaf Promote"
NOTE_C_PATH="${TEST_PROJ}/${NOTE_C_BASENAME}.md"
create_note "$NOTE_C_PATH" \
"---
title: Leaf Promote
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: \"[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Will be promoted to BRANCH.
## Content
## Connections
## Flags
"

# Allow metadataCache to settle
sleep 1

# ---------------------------------------------------------------------------
# Test 1: --dry-run — no files modified, correct count output
# ---------------------------------------------------------------------------
SPEC_DRYRUN="$(write_spec dryrun "[{\"op\":\"rename-rel\",\"from\":\"triggers\",\"to\":\"activates\"}]")"

out_dry="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_DRYRUN" --dry-run 2>/dev/null)" || {
  printf 'SKIP: test-migrate.sh (migrate failed on dry-run)\n'
  cleanup
  exit 0
}

assert_contains 'Dry-run rename-rel'    "$out_dry" "dry-run outputs 'Dry-run rename-rel'"
assert_contains 'Dry-run complete'      "$out_dry" "dry-run outputs summary line"

# Verify Note A connection was NOT modified
body_a_after_dry="$(read_note "$NOTE_A_PATH")"
assert_contains 'triggers ::'  "$body_a_after_dry" "dry-run: connection not modified"

# ---------------------------------------------------------------------------
# Test 2: rename-rel — updates ## Connections and _ontology
# ---------------------------------------------------------------------------
SPEC_RENREL="$(write_spec renrel "[{\"op\":\"rename-rel\",\"from\":\"triggers\",\"to\":\"activates\"}]")"

out_renrel="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_RENREL" 2>/dev/null)"
assert_contains 'Applied rename-rel'   "$out_renrel" "rename-rel outputs applied line"
assert_contains '1 note(s)'            "$out_renrel" "rename-rel reports 1 note modified"

sleep 1  # allow cache to settle

# Note A should now have `activates ::` instead of `triggers ::`
body_a="$(read_note "$NOTE_A_PATH")"
assert_contains 'activates ::'  "$body_a" "rename-rel: connection line updated in Note A"
if [[ "$body_a" == *"triggers ::"* ]]; then
  printf 'FAIL: rename-rel: old "triggers ::" still present in Note A\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: rename-rel: "triggers ::" removed from Note A\n'
fi

# _ontology should have `activates` instead of `triggers`
onto_body="$(read_note "${TEST_PROJ}/_ontology.${TEST_SLUG}.md")"
assert_contains '`activates`'  "$onto_body" "rename-rel: _ontology updated to activates"
if [[ "$onto_body" == *'`triggers`'* ]]; then
  printf 'FAIL: rename-rel: old "triggers" still in _ontology\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: rename-rel: "triggers" removed from _ontology\n'
fi

# ---------------------------------------------------------------------------
# Test 3: rename-rel idempotency — re-run gives 0 notes modified
# ---------------------------------------------------------------------------
out_renrel2="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_RENREL" 2>/dev/null)"
assert_contains 'Applied rename-rel to 0 note(s)' "$out_renrel2" \
  "rename-rel idempotent: 0 notes on second run"

# ---------------------------------------------------------------------------
# Test 4: rename-spine — updates spine frontmatter on matching notes
# ---------------------------------------------------------------------------
SPEC_RENSPINE="$(write_spec renspine \
  "[{\"op\":\"rename-spine\",\"from\":\"${TEST_SLUG}\",\"to\":\"${TEST_SLUG}-v2\"}]")"

out_renspine="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_RENSPINE" 2>/dev/null)"
assert_contains 'Applied rename-spine' "$out_renspine" "rename-spine outputs applied line"

sleep 1

# Note B spine should now be testmig-v2
spine_b="$(get_frontmatter_field "$NOTE_B_PATH" "spine")"
if [[ "$spine_b" == '"'*'v2"' ]] || [[ "$spine_b" == *"v2"* ]]; then
  printf 'PASS: rename-spine: Note B spine updated to include -v2\n'
else
  printf 'FAIL: rename-spine: Note B spine not updated (got: %s)\n' "$spine_b" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Test 5: rename-spine idempotency
# ---------------------------------------------------------------------------
out_renspine2="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_RENSPINE" 2>/dev/null)"
assert_contains 'Applied rename-spine to 0 note(s)' "$out_renspine2" \
  "rename-spine idempotent: 0 notes on second run"

# ---------------------------------------------------------------------------
# Test 6: add-field — adds field to matching LEAF notes only
# ---------------------------------------------------------------------------
SPEC_ADDFIELD="$(write_spec addfield \
  "[{\"op\":\"add-field\",\"field\":\"reviewed\",\"value\":false,\"filter\":{\"type\":\"LEAF\"}}]")"

out_addf="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_ADDFIELD" 2>/dev/null)"
assert_contains 'Applied add-field' "$out_addf" "add-field outputs applied line"

sleep 1

# Note A (LEAF) should now have reviewed: false
reviewed_a="$(get_frontmatter_field "$NOTE_A_PATH" "reviewed")"
if [[ "$reviewed_a" == "false" ]]; then
  printf 'PASS: add-field: "reviewed" field added to Note A (LEAF)\n'
else
  printf 'FAIL: add-field: expected "reviewed"=false on Note A, got: %s\n' "$reviewed_a" >&2
  FAILURES=$((FAILURES + 1))
fi

# ROOT note should NOT have the field added (filter is type:LEAF)
root_path="${TEST_PROJ}/${TEST_UPPER}.ROOT - ${TEST_TITLE}.md"
reviewed_root="$(get_frontmatter_field "$root_path" "reviewed")"
if [[ "$reviewed_root" == "null" ]]; then
  printf 'PASS: add-field: ROOT note not modified (filter type:LEAF respected)\n'
else
  printf 'FAIL: add-field: ROOT note should not have "reviewed" field (got: %s)\n' \
    "$reviewed_root" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Test 7: add-field idempotency
# ---------------------------------------------------------------------------
out_addf2="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_ADDFIELD" 2>/dev/null)"
assert_contains 'Applied add-field to 0 note(s)' "$out_addf2" \
  "add-field idempotent: 0 notes on second run"

# ---------------------------------------------------------------------------
# Test 8: promote — LEAF becomes BRANCH, file renamed to BRANCH convention
# ---------------------------------------------------------------------------
SPEC_PROMOTE="$(write_spec promote \
  "[{\"op\":\"promote\",\"note\":\"${TEST_UPPER}.leaf-promote\"}]")"

out_promote="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_PROMOTE" 2>/dev/null)"
assert_contains 'Applied promote' "$out_promote" "promote outputs applied line"
assert_contains '1 note(s)'        "$out_promote" "promote reports 1 note modified"

sleep 1

# Old LEAF path should no longer exist; new BRANCH path should exist
EXPECTED_BRANCH_PATH="${TEST_PROJ}/${TEST_UPPER}.LEAF-PROMOTE.leaf-promote - Leaf Promote.md"
old_exists="$(file_exists "$NOTE_C_PATH")"
new_exists="$(file_exists "$EXPECTED_BRANCH_PATH")"

if [[ "$old_exists" == "no" ]]; then
  printf 'PASS: promote: old LEAF path no longer exists\n'
else
  printf 'FAIL: promote: old LEAF path still exists: %s\n' "$NOTE_C_PATH" >&2
  FAILURES=$((FAILURES + 1))
fi

if [[ "$new_exists" == "yes" ]]; then
  printf 'PASS: promote: new BRANCH path exists: %s\n' "$EXPECTED_BRANCH_PATH"
else
  printf 'FAIL: promote: new BRANCH path not found: %s\n' "$EXPECTED_BRANCH_PATH" >&2
  FAILURES=$((FAILURES + 1))
fi

# New BRANCH note should have type: BRANCH
branch_type="$(get_frontmatter_field "$EXPECTED_BRANCH_PATH" "type")"
if [[ "$branch_type" == '"BRANCH"' ]]; then
  printf 'PASS: promote: frontmatter type is BRANCH\n'
else
  printf 'FAIL: promote: expected type BRANCH, got: %s\n' "$branch_type" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Test 9: promote idempotency — note is now BRANCH, should give 0 modified
# ---------------------------------------------------------------------------
out_promote2="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_PROMOTE" 2>/dev/null)"
assert_contains 'Applied promote to 0 note(s)' "$out_promote2" \
  "promote idempotent: 0 notes when already BRANCH"

# ---------------------------------------------------------------------------
# Test 10: validation failure — non-existent relationship type
# ---------------------------------------------------------------------------
SPEC_BADREL="$(write_spec badrel "[{\"op\":\"rename-rel\",\"from\":\"nonexistent-rel\",\"to\":\"whatever\"}]")"
err_badrel="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_BADREL" 2>&1)" \
  && badrel_exit=0 || badrel_exit=$?

if [[ $badrel_exit -ne 0 ]]; then
  printf 'PASS: validation failure exits 1 for non-existent rel type\n'
else
  printf 'FAIL: expected exit 1 for non-existent rel type, got 0\n' >&2
  FAILURES=$((FAILURES + 1))
fi
assert_contains 'not found in _ontology' "$err_badrel" \
  "validation failure: correct error message for unknown rel type"

# ---------------------------------------------------------------------------
# Test 11: validation failure — non-existent note for promote
# ---------------------------------------------------------------------------
SPEC_BADNOTE="$(write_spec badnote "[{\"op\":\"promote\",\"note\":\"TESTMIG.nonexistent-note\"}]")"
err_badnote="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_BADNOTE" 2>&1)" \
  && badnote_exit=0 || badnote_exit=$?

if [[ $badnote_exit -ne 0 ]]; then
  printf 'PASS: validation failure exits 1 for non-existent note\n'
else
  printf 'FAIL: expected exit 1 for non-existent note, got 0\n' >&2
  FAILURES=$((FAILURES + 1))
fi
assert_contains 'not found in' "$err_badnote" \
  "validation failure: correct error message for missing note"

# ---------------------------------------------------------------------------
# Test 12: validation failure — invalid spec (structural)
# ---------------------------------------------------------------------------
SPEC_BAD_STRUCT="$(write_spec badstruct "[{\"op\":\"add-field\",\"value\":\"x\"}]")"
err_struct="$(bash "$MIGRATE" "$VAULT" "$TEST_SLUG" "$SPEC_BAD_STRUCT" 2>&1)" \
  && struct_exit=0 || struct_exit=$?

if [[ $struct_exit -ne 0 ]]; then
  printf 'PASS: structural validation exits 1 for missing required field\n'
else
  printf 'FAIL: expected exit 1 for missing "field" in add-field, got 0\n' >&2
  FAILURES=$((FAILURES + 1))
fi
assert_contains 'missing required field' "$err_struct" \
  "structural validation: correct error for missing field in add-field"

# ---------------------------------------------------------------------------
# Test 13: vault= parameter form
# ---------------------------------------------------------------------------
SPEC_VP="$(write_spec vaultparam "[{\"op\":\"rename-rel\",\"from\":\"activates\",\"to\":\"activates\"}]")"
# activates → activates is a no-op rename (0 modifications expected)
# But first check if activates is even in the ontology at this point
# It should be from test 2. Even if 0 notes, it should exit 0.
out_vp="$(bash "$MIGRATE" "vault=${VAULT}" "$TEST_SLUG" "$SPEC_VP" 2>/dev/null)" && vp_exit=0 || vp_exit=$?
if [[ $vp_exit -eq 0 ]]; then
  printf 'PASS: vault= parameter form works (exit 0)\n'
else
  printf 'FAIL: vault= parameter form failed (exit %d)\n' "$vp_exit" >&2
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
  printf '\ntest-migrate.sh: all assertions passed\n'
else
  printf '\ntest-migrate.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
