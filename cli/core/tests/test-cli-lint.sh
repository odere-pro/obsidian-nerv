#!/usr/bin/env bash
# test-cli-lint.sh — Tests for cli-lint.sh reflex skill
#
# Creates deliberately malformed notes to verify each lint rule fires,
# then creates a clean note and verifies 0 issues for that file.
#
# Run via test-harness.sh:
#   test-harness.sh study test-cli-lint.sh
# Or directly:
#   TEST_VAULT=study bash test-cli-lint.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
LINT="$(dirname "$SCRIPT_DIR")/cli-lint.sh"

LINT_DIR="projects/_lint-test"

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
  ob_eval "$VAULT" "(async () => {
    const dir = '${LINT_DIR}';
    const folder = app.vault.getAbstractFileByPath(dir);
    if (!folder) await app.vault.createFolder(dir);
    await app.vault.create(${js_path}, ${js_content});
  })()" > /dev/null 2>&1
}

cleanup() {
  ob_eval "$VAULT" "(async () => {
    const f = app.vault.getAbstractFileByPath('${LINT_DIR}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
  printf 'INFO: lint test folder trashed (cleanup)\n'
}

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
cleanup

# Verify Obsidian is reachable
ping_result="$(ob_eval "$VAULT" '1+1' 2>/dev/null)" || ping_result=""
if [[ -z "$ping_result" ]]; then
  printf 'SKIP: test-cli-lint.sh (Obsidian not reachable)\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# Create test notes — one violation per rule category
# ---------------------------------------------------------------------------

# 1. Missing required field: no 'kind' field
create_note "${LINT_DIR}/missing-kind.md" \
"---
title: Missing Kind
aliases: []
type: LEAF
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
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
"

# 2. ROOT with non-empty parent
create_note "${LINT_DIR}/root-with-parent.md" \
"---
title: Root With Parent
aliases: []
type: ROOT
kind: concept
spine: linttest
status: draft
parent: \"[[some-parent]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Summary
## Map
## Connections
## Flags
"

# 3. LEAF without parent
create_note "${LINT_DIR}/leaf-no-parent.md" \
"---
title: Leaf No Parent
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"\"
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
"

# 4. BRANCH with empty children
create_note "${LINT_DIR}/branch-empty-children.md" \
"---
title: Branch Empty Children
aliases: []
type: BRANCH
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
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
"

# 5. Spine tag in body (#linttest in text)
create_note "${LINT_DIR}/spine-tag-body.md" \
"---
title: Spine Tag In Body
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Tagged with #linttest for testing.
## Content
## Connections
## Flags
"

# 6. Legacy #flag/ tag in body
create_note "${LINT_DIR}/legacy-flag-tag.md" \
"---
title: Legacy Flag Tag
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
See #flag/urgent for details.
## Content
## Connections
## Flags
"

# 7. Legacy #status/ tag in body
create_note "${LINT_DIR}/legacy-status-tag.md" \
"---
title: Legacy Status Tag
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Marked as #status/review.
## Content
## Connections
## Flags
"

# 8. Untyped connection (has [[ but no :: [[)
create_note "${LINT_DIR}/untyped-connection.md" \
"---
title: Untyped Connection
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
- [[some-other-note]]
## Flags
"

# 9. Connection count > 7
create_note "${LINT_DIR}/too-many-connections.md" \
"---
title: Too Many Connections
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
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

# 10. Missing ## Breadcrumb on LEAF
create_note "${LINT_DIR}/no-breadcrumb.md" \
"---
title: No Breadcrumb
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Summary
## Content
## Connections
## Flags
"

# 11. Callout flag count > 3
create_note "${LINT_DIR}/too-many-flags.md" \
"---
title: Too Many Flags
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
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

# 12. Clean note — should produce zero issues
create_note "${LINT_DIR}/clean-note.md" \
"---
title: Clean Note
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: \"[[_LINT-TEST.root - Lint Root]]\"
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
"

# ---------------------------------------------------------------------------
# Run lint on the test folder
# ---------------------------------------------------------------------------
lint_text="$(bash "$LINT" "$VAULT" "$LINT_DIR" 2>/dev/null)" || lint_text=""
lint_json="$(bash "$LINT" "$VAULT" "$LINT_DIR" --json 2>/dev/null)" || lint_json="{}"

# Basic output checks
assert_contains "Lint complete." "$lint_text" "lint text output ends with summary line"
assert_json_valid "$lint_json"   "lint --json produces valid JSON"

# JSON contains required top-level keys
assert_contains '"vault"'  "$lint_json" "--json output has vault key"
assert_contains '"folder"' "$lint_json" "--json output has folder key"
assert_contains '"issues"' "$lint_json" "--json output has issues key"
assert_contains '"count"'  "$lint_json" "--json output has count key"

# ---------------------------------------------------------------------------
# Verify each rule fires
# ---------------------------------------------------------------------------
check_rule() {
  local rule="$1" label="$2"
  if printf '%s' "$lint_json" | python3 -c "
import json,sys
d = json.loads(sys.stdin.read())
rules = [i['rule'] for i in d['issues']]
sys.exit(0 if '$rule' in rules else 1)
" 2>/dev/null; then
    printf 'PASS: rule "%s" detected (%s)\n' "$rule" "$label"
  else
    printf 'FAIL: rule "%s" not detected (%s)\n' "$rule" "$label" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

check_rule "missing-required-field"       "missing 'kind' field"
check_rule "root-has-parent"              "ROOT with non-empty parent"
check_rule "missing-parent"              "LEAF/BRANCH without parent"
check_rule "branch-empty-children"        "BRANCH with empty children"
check_rule "spine-tag-in-body"            "spine tag in body"
check_rule "legacy-flag-tag"             "legacy #flag/ tag"
check_rule "legacy-status-tag"           "legacy #status/ tag"
check_rule "untyped-connection"          "untyped connection"
check_rule "connection-count-exceeded"   "connection count > 7"
check_rule "missing-breadcrumb"          "missing ## Breadcrumb"
check_rule "callout-flag-count-exceeded" "callout flag count > 3"

# ---------------------------------------------------------------------------
# Verify clean note produces no issues
# ---------------------------------------------------------------------------
clean_issues="$(printf '%s' "$lint_json" | python3 -c "
import json,sys
d = json.loads(sys.stdin.read())
clean = [i for i in d['issues'] if i['file'].endswith('clean-note.md')]
print(len(clean))
" 2>/dev/null || echo 1)"

if [[ "$clean_issues" == "0" ]]; then
  printf 'PASS: clean note produces 0 issues\n'
else
  printf 'FAIL: clean note produced %s unexpected issue(s)\n' "$clean_issues" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Verify exclusions: create a tpl- and _ontology file, confirm not counted
# ---------------------------------------------------------------------------
create_note "${LINT_DIR}/tpl-test.md" "---\ntitle: template\n---\n"
create_note "${LINT_DIR}/_ontology.test.md" "---\ntitle: onto\n---\n"

lint_json2="$(bash "$LINT" "$VAULT" "$LINT_DIR" --json 2>/dev/null)" || lint_json2="{}"
count_before="$(python3 -c "import json,sys; d=json.loads('${lint_json}'); print(d.get('count',0))" 2>/dev/null || echo 0)"
count_after="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('count',0))" "$lint_json2" 2>/dev/null || echo 0)"

# count should not increase due to excluded files (they have missing fields but are excluded)
if [[ "$count_after" == "$count_before" ]]; then
  printf 'PASS: tpl-* and _ontology* files are excluded from lint\n'
else
  printf 'FAIL: exclusion check — count changed from %s to %s after adding excluded files\n' \
    "$count_before" "$count_after" >&2
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
  printf '\ntest-cli-lint.sh: all assertions passed\n'
else
  printf '\ntest-cli-lint.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
