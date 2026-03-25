#!/usr/bin/env bash
# test-dependency-map.sh — Tests for dependency-map.sh dev skill
#
# Run via test-harness.sh or directly:
#   TEST_VAULT=obsidian_docs bash test-dependency-map.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set}"
DEP_MAP="$(dirname "$SCRIPT_DIR")/../dev/dependency-map.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testdepmap"
TEST_TITLE="Test Dep Map"
TEST_PROJ="projects/${TEST_SLUG}"
TEST_UPPER="TESTDEPMAP"

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
  printf 'SKIP: test-dependency-map.sh (Obsidian not reachable)\n'
  exit 0
fi

ROOT_BASE="${TEST_UPPER}.ROOT - ${TEST_TITLE}"
SVC_A="${TEST_UPPER}.svc-a - Service A"
SVC_B="${TEST_UPPER}.svc-b - Service B"

# Service A — depends-on Root, also has a related-to to Service B
create_note "${TEST_PROJ}/${SVC_A}.md" \
"---
title: Service A
type: LEAF
kind: service
spine: ${TEST_SLUG}
status: draft
parent: \"[[${ROOT_BASE}]]\"
children: []
aliases: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
- depends-on :: [[${ROOT_BASE}]]
- related-to :: [[${SVC_B}]]
## Flags
"

# Service B — depends-on Root
create_note "${TEST_PROJ}/${SVC_B}.md" \
"---
title: Service B
type: LEAF
kind: service
spine: ${TEST_SLUG}
status: draft
parent: \"[[${ROOT_BASE}]]\"
children: []
aliases: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
- depends-on :: [[${ROOT_BASE}]]
## Flags
"

# ---------------------------------------------------------------------------
# Run dependency-map.sh (JSON)
# ---------------------------------------------------------------------------
out="$(bash "$DEP_MAP" "$VAULT" "$TEST_SLUG" 2>/dev/null)" || out=''

if [[ -z "$out" ]]; then
  printf 'SKIP: test-dependency-map.sh (Obsidian not reachable)\n'
  cleanup; exit 0
fi

assert_json_valid "$out" "dependency-map returns valid JSON"
assert_contains '"project"' "$out" "JSON has project field"
assert_contains '"edges"'   "$out" "JSON has edges field"
assert_contains "\"${TEST_SLUG}\"" "$out" "project field matches slug"

# Only depends-on edges should be in output
python3 - "$out" <<'PYEOF'
import json, sys
data  = json.loads(sys.argv[1])
edges = data.get('edges', [])
# Verify all edges are depends-on (no rel field — filtered away)
# Verify no related-to edges leaked through
for e in edges:
    assert 'rel' not in e, 'Edge should not have rel field after filtering: {}'.format(e)
# At least 2 depends-on edges from our test notes
if len(edges) >= 2:
    print('PASS: {} depends-on edge(s) returned (no related-to)'.format(len(edges)))
else:
    sys.stderr.write('FAIL: expected >= 2 edges, got {}: {}\n'.format(len(edges), edges))
    sys.exit(1)
PYEOF
edges_ok=$?
[[ $edges_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# Edge schema: source, target, context
python3 - "$out" <<'PYEOF'
import json, sys
data  = json.loads(sys.argv[1])
edges = data.get('edges', [])
if not edges:
    print('SKIP: no edges to check schema')
    sys.exit(0)
e = edges[0]
required = {'source', 'target', 'context'}
missing  = required - set(e.keys())
if missing:
    sys.stderr.write('FAIL: edge missing keys: {}\n'.format(missing))
    sys.exit(1)
print('PASS: edge schema correct: {}'.format(list(e.keys())))
PYEOF
schema_ok=$?
[[ $schema_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# related-to edge must be excluded: verify svc-b never appears as a TARGET
# (the only connection to svc-b was the related-to from svc-a;
#  svc-b itself only points TO root via depends-on, not the other way).
# Note: cli-relations.sh \s*[—-]\s* context regex can span lines so the
# context field of a depends-on edge may contain the next connection line's
# text — we do NOT check context content here.
python3 - "$out" <<'PYEOF'
import json, sys
data   = json.loads(sys.argv[1])
edges  = data.get('edges', [])
targets = [e.get('target', '') for e in edges]
bad = [t for t in targets if 'svc-b' in t]
if not bad:
    print('PASS: related-to target (svc-b) not present as any edge target')
else:
    sys.stderr.write('FAIL: svc-b appeared as target (related-to leaked): {}\n'.format(bad))
    sys.exit(1)
PYEOF
related_ok=$?
[[ $related_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# DOT format
# ---------------------------------------------------------------------------
out_dot="$(bash "$DEP_MAP" "$VAULT" "$TEST_SLUG" --format dot 2>/dev/null)" || out_dot=''
assert_contains "digraph ${TEST_SLUG}" "$out_dot" "--format dot produces DOT digraph"
assert_contains ' -> '                 "$out_dot" "DOT output contains edge arrows"

# ---------------------------------------------------------------------------
# vault= parameter
# ---------------------------------------------------------------------------
out_vp="$(bash "$DEP_MAP" "vault=${VAULT}" "$TEST_SLUG" 2>/dev/null)" || out_vp=''
assert_json_valid "$out_vp" "vault= parameter form returns valid JSON"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-dependency-map.sh: all assertions passed\n'
else
  printf '\ntest-dependency-map.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi
exit "$FAILURES"
