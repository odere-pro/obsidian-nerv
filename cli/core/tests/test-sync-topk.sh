#!/usr/bin/env bash
# test-sync-topk.sh — Tests for sync-topk.sh autonomic skill
#
# Creates notes that intentionally exceed each limit, runs sync-topk, and
# verifies the correct overflow rows are appended without duplication.
#
# Run via test-harness.sh:
#   test-harness.sh study test-sync-topk.sh
# Or directly:
#   TEST_VAULT=study bash test-sync-topk.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"
SYNC_TOPK="$(dirname "$SCRIPT_DIR")/sync-topk.sh"

TEST_SLUG="testtopk"
TEST_TITLE="Test TopK"
TEST_PROJ="projects/${TEST_SLUG}"
TEST_UPPER="TESTTOPK"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

create_note() {
  local path="$1" content="$2"
  local js_path js_content
  js_path="$(json_str "$path")"
  js_content="$(json_str "$content")"
  ob_eval "$VAULT" \
    "(async () => { await app.vault.create(${js_path}, ${js_content}); })()" \
    > /dev/null 2>&1
}

read_topk_log() {
  local js_path
  js_path="$(json_str "${TEST_PROJ}/_topk.${TEST_SLUG}.md")"
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
# Setup: create fresh project
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_SLUG" "$TEST_TITLE" > /dev/null 2>&1; then
  printf 'SKIP: test-sync-topk.sh (Obsidian not reachable)\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# Create three over-limit notes
# ---------------------------------------------------------------------------

# 1. Note with 8 typed connections (exceeds limit of 7)
create_note "${TEST_PROJ}/${TEST_UPPER}.over-conn - Over Connections.md" \
"---
title: Over Connections
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
## Content
## Connections
- depends-on :: [[note-a]]
- depends-on :: [[note-b]]
- depends-on :: [[note-c]]
- depends-on :: [[note-d]]
- depends-on :: [[note-e]]
- depends-on :: [[note-f]]
- depends-on :: [[note-g]]
- depends-on :: [[note-h]]
## Flags
"

# 2. Note with 4 callout flags (exceeds limit of 3)
create_note "${TEST_PROJ}/${TEST_UPPER}.over-flags - Over Flags.md" \
"---
title: Over Flags
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
## Content
## Connections
## Flags
> [!flag] Flag one
> [!flag] Flag two
> [!flag] Flag three
> [!flag] Flag four
"

# 3. BRANCH note with 8 children (exceeds limit of 7)
create_note "${TEST_PROJ}/${TEST_UPPER}.over-children - Over Children.md" \
"---
title: Over Children
aliases: []
type: BRANCH
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: \"[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]\"
children:
  - \"[[child-a]]\"
  - \"[[child-b]]\"
  - \"[[child-c]]\"
  - \"[[child-d]]\"
  - \"[[child-e]]\"
  - \"[[child-f]]\"
  - \"[[child-g]]\"
  - \"[[child-h]]\"
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
## Flags
"

# 4. Clean note — should produce no overflow entries
create_note "${TEST_PROJ}/${TEST_UPPER}.clean-note - Clean Note.md" \
"---
title: Clean Note
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
## Content
## Connections
- depends-on :: [[note-a]]
## Flags
"

# ---------------------------------------------------------------------------
# Run sync-topk
# ---------------------------------------------------------------------------
sync_out="$(bash "$SYNC_TOPK" "$VAULT" "$TEST_SLUG" 2>/dev/null)" || sync_out=""

if [[ -n "$sync_out" ]]; then
  printf 'PASS: sync-topk.sh exits 0\n'
else
  printf 'FAIL: sync-topk.sh produced no output (error?)\n' >&2
  FAILURES=$((FAILURES + 1))
fi

assert_contains "overflow row(s) appended" "$sync_out" \
  "sync-topk output reports rows appended"

# ---------------------------------------------------------------------------
# Verify overflow log content
# ---------------------------------------------------------------------------
topk_content="$(read_topk_log)"

assert_contains "over-conn" "$topk_content" \
  "overflow log contains over-connections note entry"
assert_contains "connections" "$topk_content" \
  "overflow log contains 'connections' field"

assert_contains "over-flags" "$topk_content" \
  "overflow log contains over-flags note entry"
assert_contains "callout-flags" "$topk_content" \
  "overflow log contains 'callout-flags' field"

assert_contains "over-children" "$topk_content" \
  "overflow log contains over-children note entry"
assert_contains "children" "$topk_content" \
  "overflow log contains 'children' field"

# Clean note should NOT appear in overflow log
if printf '%s' "$topk_content" | grep -q "clean-note"; then
  printf 'FAIL: overflow log incorrectly contains clean-note entry\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: clean note not in overflow log\n'
fi

# ---------------------------------------------------------------------------
# Count rows before re-run (for idempotency check)
# ---------------------------------------------------------------------------
row_count_before="$(printf '%s' "$topk_content" | grep -c '^\| 20' || echo 0)"

# ---------------------------------------------------------------------------
# Idempotency: re-run should add zero new rows
# ---------------------------------------------------------------------------
bash "$SYNC_TOPK" "$VAULT" "$TEST_SLUG" > /dev/null 2>&1 || true
topk_after="$(read_topk_log)"
row_count_after="$(printf '%s' "$topk_after" | grep -c '^\| 20' || echo 0)"

if [[ "$row_count_after" == "$row_count_before" ]]; then
  printf 'PASS: sync-topk is idempotent (no duplicate rows on re-run)\n'
else
  printf 'FAIL: re-run added rows: before=%s after=%s\n' \
    "$row_count_before" "$row_count_after" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Verify updated: date was set
# ---------------------------------------------------------------------------
assert_contains "updated:" "$topk_after" \
  "_topk frontmatter has updated: field"

# ---------------------------------------------------------------------------
# vault= parameter routing
# ---------------------------------------------------------------------------
vault_form_out="$(bash "$SYNC_TOPK" "vault=${VAULT}" "$TEST_SLUG" 2>/dev/null)" || vault_form_out=""
assert_contains "overflow row(s) appended" "$vault_form_out" \
  "vault= parameter form works"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-sync-topk.sh: all assertions passed\n'
else
  printf '\ntest-sync-topk.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
