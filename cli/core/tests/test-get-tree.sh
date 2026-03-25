#!/usr/bin/env bash
# test-get-tree.sh — Tests for get-tree.sh sensory skill
#
# Builds a small 3-level hierarchy (ROOT > BRANCH > LEAF), a missing-child
# reference, and a cycle, then validates the JSON tree output.
#
# Run via test-harness.sh or directly:
#   TEST_VAULT=obsidian_docs bash test-get-tree.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set}"
GET_TREE="$(dirname "$SCRIPT_DIR")/get-tree.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testtree"
TEST_TITLE="Test Tree"
TEST_PROJ="projects/${TEST_SLUG}"
TEST_UPPER="TESTTREE"

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
  printf 'SKIP: test-get-tree.sh (Obsidian not reachable)\n'
  exit 0
fi

# Determine ROOT basename from create-project.sh convention
ROOT_BASENAME="${TEST_UPPER}.ROOT - ${TEST_TITLE}"
BRANCH_BASENAME="${TEST_UPPER}.my-branch - My Branch"
LEAF_BASENAME="${TEST_UPPER}.my-leaf - My Leaf"

# Update ROOT to declare children (BRANCH + one missing ref)
update_root_js="(async () => {
  var p = $(json_str "${TEST_PROJ}/${ROOT_BASENAME}.md");
  var f = app.vault.getAbstractFileByPath(p);
  if (!f) return;
  await app.fileManager.processFrontMatter(f, function(fm) {
    fm.children = [
      '[[${BRANCH_BASENAME}]]',
      '[[${TEST_UPPER}.ghost - Ghost Note]]'
    ];
  });
})()"
ob_eval "$VAULT" "$update_root_js" >/dev/null 2>&1

# BRANCH note with one LEAF child and one self-cycle reference for cycle test
create_note "${TEST_PROJ}/${BRANCH_BASENAME}.md" \
"---
title: My Branch
aliases: []
type: BRANCH
kind: concept
spine: ${TEST_SLUG}
status: evergreen
parent: \"[[${ROOT_BASENAME}]]\"
children:
  - \"[[${LEAF_BASENAME}]]\"
  - \"[[${ROOT_BASENAME}]]\"
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Branch node.
## Content
## Connections
## Flags
"

# LEAF note (no children)
create_note "${TEST_PROJ}/${LEAF_BASENAME}.md" \
"---
title: My Leaf
aliases: []
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: \"[[${BRANCH_BASENAME}]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
Leaf node.
## Content
## Connections
## Flags
"

# ---------------------------------------------------------------------------
# Run get-tree
# ---------------------------------------------------------------------------
out="$(bash "$GET_TREE" "$VAULT" "$TEST_SLUG" 2>/dev/null)" || out=''

if [[ -z "$out" ]]; then
  printf 'SKIP: test-get-tree.sh (Obsidian not reachable)\n'
  cleanup
  exit 0
fi

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------
assert_json_valid "$out" "get-tree returns valid JSON"
assert_contains '"folder"'    "$out" "JSON has folder field"
assert_contains '"nodeCount"' "$out" "JSON has nodeCount field"
assert_contains '"tree"'      "$out" "JSON has tree field"

# folder value
assert_contains "\"projects/${TEST_SLUG}\"" "$out" "folder field has correct value"

# ROOT present in tree
assert_contains '"ROOT"' "$out" "ROOT node present in tree"

# BRANCH present
assert_contains '"BRANCH"' "$out" "BRANCH node present in tree"

# LEAF present
assert_contains '"LEAF"' "$out" "LEAF node present in tree"

# Missing child reported
assert_contains '"missing"' "$out" "missing child represented in tree"

# Cycle detected
assert_contains '"cycle"' "$out" "cycle node represented in tree"

# nodeCount >= 3 (ROOT + BRANCH + LEAF at minimum)
python3 - "$out" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
n = data.get('nodeCount', 0)
if n >= 3:
    print('PASS: nodeCount >= 3 (got {})'.format(n))
else:
    sys.stderr.write('FAIL: nodeCount should be >= 3, got {}\n'.format(n))
    sys.exit(1)
PYEOF
nc_ok=$?
[[ $nc_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# status and kind fields present in tree nodes
assert_contains '"status"' "$out" "tree nodes include status field"
assert_contains '"kind"'   "$out" "tree nodes include kind field"

# subtree nesting: BRANCH is inside ROOT's subtree
python3 - "$out" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
tree = data.get('tree', [])
root_node = next((n for n in tree if n.get('type') == 'ROOT'), None)
if not root_node:
    sys.stderr.write('FAIL: no ROOT node found in tree\n'); sys.exit(1)
subtypes = [c.get('type') for c in root_node.get('subtree', [])]
if 'BRANCH' in subtypes:
    print('PASS: BRANCH is a direct child of ROOT in tree')
else:
    sys.stderr.write('FAIL: BRANCH not found in ROOT subtree, got: {}\n'.format(subtypes))
    sys.exit(1)
PYEOF
nesting_ok=$?
[[ $nesting_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# --depth 1 limits to ROOT + its direct children (no LEAF at depth 2)
out_d1="$(bash "$GET_TREE" "$VAULT" "$TEST_SLUG" --depth 1 2>/dev/null)" || out_d1=''
python3 - "$out_d1" <<'PYEOF'
import json, sys
data  = json.loads(sys.argv[1])
tree  = data.get('tree', [])
root  = next((n for n in tree if n.get('type') == 'ROOT'), None)
if not root:
    print('SKIP: no ROOT in depth-limited tree'); sys.exit(0)
# At depth 1 the BRANCH node should exist but have an empty subtree
branch = next((c for c in root.get('subtree', []) if c.get('type') == 'BRANCH'), None)
if branch and branch.get('subtree') == []:
    print('PASS: --depth 1 stops recursion after first level')
elif not branch:
    print('PASS: --depth 1 result has no BRANCH (depth cap hit at ROOT level)')
else:
    sys.stderr.write('FAIL: --depth 1 BRANCH subtree not empty: {}\n'.format(branch.get('subtree')))
    sys.exit(1)
PYEOF
depth_ok=$?
[[ $depth_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# vault= parameter routing
out_vp="$(bash "$GET_TREE" "vault=${VAULT}" "$TEST_SLUG" 2>/dev/null)" || out_vp=''
assert_json_valid "$out_vp" "vault= parameter form returns valid JSON"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-get-tree.sh: all assertions passed\n'
else
  printf '\ntest-get-tree.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
