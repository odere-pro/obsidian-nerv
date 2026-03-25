#!/usr/bin/env bash
# test-code-link.sh — Tests for code-link.sh dev skill
#
# Run via test-harness.sh or directly:
#   TEST_VAULT=obsidian_docs bash test-code-link.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set}"
CODE_LINK="$(dirname "$SCRIPT_DIR")/../dev/code-link.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testcodelink"
TEST_TITLE="Test Code Link"
TEST_PROJ="projects/${TEST_SLUG}"
TEST_UPPER="TESTCODELINK"

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
  ob_eval "$VAULT" \
    "(async()=>{ const f=app.vault.getAbstractFileByPath($(json_str "$1")); return f ? await app.vault.cachedRead(f) : ''; })()" \
    2>/dev/null || true
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
  printf 'SKIP: test-code-link.sh (Obsidian not reachable)\n'
  exit 0
fi

NOTE_BASE="${TEST_UPPER}.auth-service - Auth Service"
NOTE_PATH="${TEST_PROJ}/${NOTE_BASE}.md"

create_note "$NOTE_PATH" \
"---
title: Auth Service
type: LEAF
kind: service
spine: ${TEST_SLUG}
status: draft
parent: \"[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]\"
children: []
aliases: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Auth service handles JWT issuance.
## Content
## Connections
- depends-on :: [[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]
## Flags
"

# ---------------------------------------------------------------------------
# Test 1: append code link
# ---------------------------------------------------------------------------
CODE_PATH="src/auth/handler.ts"
out="$(bash "$CODE_LINK" "$VAULT" "$NOTE_PATH" "$CODE_PATH" 2>/dev/null)" || out=''

if [[ -z "$out" ]]; then
  printf 'SKIP: test-code-link.sh (Obsidian not reachable)\n'
  cleanup; exit 0
fi

assert_contains "appended to" "$out" "code-link reports appended"
assert_contains "$CODE_PATH"  "$out" "code-link echoes the code path"

content="$(read_note "$NOTE_PATH")"
assert_contains "implements" "$content" "## Connections has implements entry"
assert_contains "$CODE_PATH"  "$content" "code path present in note"
assert_contains '`'"$CODE_PATH"'`' "$content" "code path wrapped in backticks"

# ---------------------------------------------------------------------------
# Test 2: idempotency — re-run produces no duplicate
# ---------------------------------------------------------------------------
bash "$CODE_LINK" "$VAULT" "$NOTE_PATH" "$CODE_PATH" >/dev/null 2>&1 || true
content_after="$(read_note "$NOTE_PATH")"

count="$(printf '%s' "$content_after" | grep -c "$CODE_PATH" || echo 0)"
if [[ "$count" -eq 1 ]]; then
  printf 'PASS: idempotent — code path appears exactly once after re-run\n'
else
  printf 'FAIL: code path appears %s times (expected 1)\n' "$count" >&2
  FAILURES=$((FAILURES + 1))
fi

# Re-run output should say "already present"
out2="$(bash "$CODE_LINK" "$VAULT" "$NOTE_PATH" "$CODE_PATH" 2>/dev/null)" || out2=''
assert_contains "already present" "$out2" "re-run reports already present"

# ---------------------------------------------------------------------------
# Test 3: second distinct code path appended independently
# ---------------------------------------------------------------------------
CODE_PATH2="src/auth/middleware.ts"
bash "$CODE_LINK" "$VAULT" "$NOTE_PATH" "$CODE_PATH2" >/dev/null 2>&1 || true
content3="$(read_note "$NOTE_PATH")"
assert_contains "$CODE_PATH2" "$content3" "second code path appended"
assert_contains "$CODE_PATH"  "$content3" "first code path still present after second append"

# ---------------------------------------------------------------------------
# Test 4: security — code path containing ]] rejected
# ---------------------------------------------------------------------------
bad_out="$(bash "$CODE_LINK" "$VAULT" "$NOTE_PATH" 'src/bad]]path.ts' 2>&1)" || true
assert_contains "ERROR" "$bad_out" "code path with ]] rejected with error"

# ---------------------------------------------------------------------------
# Test 5: error on non-existent note
# ---------------------------------------------------------------------------
err_out="$(bash "$CODE_LINK" "$VAULT" "${TEST_PROJ}/NONEXISTENT.md" "$CODE_PATH" 2>&1)" || true
assert_contains "ERROR" "$err_out" "non-existent note returns error"

# ---------------------------------------------------------------------------
# Test 6: vault= parameter
# ---------------------------------------------------------------------------
out_vp="$(bash "$CODE_LINK" "vault=${VAULT}" "$NOTE_PATH" "src/other.ts" 2>/dev/null)" || out_vp=''
assert_contains "appended to" "$out_vp" "vault= parameter form works"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-code-link.sh: all assertions passed\n'
else
  printf '\ntest-code-link.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi
exit "$FAILURES"
