#!/usr/bin/env bash
# test-context.sh — Tests for context.sh primary sensory skill
#
# Creates a small project with notes targeted at specific query terms,
# runs context.sh queries, and validates JSON output structure and scoring.
#
# Run via test-harness.sh:
#   test-harness.sh obsidian_docs test-context.sh
# Or directly:
#   TEST_VAULT=obsidian_docs bash test-context.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set}"
CONTEXT="$(dirname "$SCRIPT_DIR")/context.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testctx"
TEST_TITLE="Test Context"
TEST_PROJ="projects/${TEST_SLUG}"
TEST_UPPER="TESTCTX"

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
  printf 'SKIP: test-context.sh (Obsidian not reachable)\n'
  exit 0
fi

# Note A: highly relevant to "encryption" — title + body mentions
create_note "${TEST_PROJ}/${TEST_UPPER}.encryption-note - Encryption Note.md" \
"---
title: Encryption Note
aliases:
  - AES Encryption
type: LEAF
kind: concept
spine: ${TEST_SLUG}
status: draft
parent: \"[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
tags:
  - encryption
---

## Breadcrumb
## Summary
This note covers encryption algorithms and key management.
## Content
Encryption is the process of encoding data so only authorized parties can read it.
Symmetric encryption uses the same key. Asymmetric encryption uses key pairs.
Encryption is widely used in TLS, SSH, and storage solutions.
## Connections
- depends-on :: [[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]
## Flags
"

# Note B: moderately relevant to "encryption" — only kind+body mentions
create_note "${TEST_PROJ}/${TEST_UPPER}.tls-handshake - TLS Handshake.md" \
"---
title: TLS Handshake
aliases: []
type: LEAF
kind: security
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
TLS uses encryption during the handshake phase.
## Content
The TLS handshake negotiates cipher suites.
## Connections
## Flags
"

# Note C: unrelated — should score 0 for "encryption" query
create_note "${TEST_PROJ}/${TEST_UPPER}.cooking-tips - Cooking Tips.md" \
"---
title: Cooking Tips
aliases: []
type: LEAF
kind: recipe
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
Some cooking advice.
## Content
Boil water before adding pasta.
## Connections
## Flags
"

# ---------------------------------------------------------------------------
# Test 1: basic query — returns JSON with correct structure
# ---------------------------------------------------------------------------
out1="$(bash "$CONTEXT" "$VAULT" "encryption" 2>/dev/null)" || out1=''

if [[ -z "$out1" ]]; then
  printf 'SKIP: test-context.sh (Obsidian not reachable)\n'
  cleanup
  exit 0
fi

assert_json_valid "$out1" "context.sh returns valid JSON"
assert_contains '"query"' "$out1" "JSON has query field"
assert_contains '"vault"' "$out1" "JSON has vault field"
assert_contains '"results"' "$out1" "JSON has results field"

# Encryption Note should appear in results
assert_contains "encryption-note" "$out1" "high-relevance note appears in results"

# Cooking Tips should NOT appear (score 0)
if printf '%s' "$out1" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read())
paths=[r['path'] for r in d.get('results',[])]
assert all('cooking' not in p for p in paths), 'cooking-tips found: ' + str(paths)
" 2>/dev/null; then
  printf 'PASS: zero-score note excluded from results\n'
else
  printf 'FAIL: zero-score note should not appear in results\n' >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Test 2: result schema — all required fields present
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
required = ['path','title','type','kind','spine','status','parent',
            'children','aliases','breadcrumb','summary','content','connections']
r = data['results'][0] if data['results'] else {}
missing = [k for k in required if k not in r]
if missing:
    sys.stderr.write('FAIL: missing fields in result: {}\n'.format(missing))
    sys.exit(1)
print('PASS: all required result fields present ({})'.format(list(r.keys())))
PYEOF
result_schema_ok=$?
if [[ $result_schema_ok -ne 0 ]]; then
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# Test 3: ranking — encryption-note should outscore tls-handshake
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data  = json.loads(sys.argv[1])
paths = [r['path'] for r in data.get('results', [])]
enc   = next((i for i,p in enumerate(paths) if 'encryption-note' in p), -1)
tls   = next((i for i,p in enumerate(paths) if 'tls-handshake'   in p), -1)
if enc == -1:
    sys.stderr.write('FAIL: encryption-note missing from results\n'); sys.exit(1)
if tls != -1 and enc < tls:
    print('PASS: encryption-note ranked above tls-handshake (positions: {} vs {})'.format(enc, tls))
elif tls == -1:
    print('PASS: encryption-note in results, tls-handshake correctly excluded or below limit')
else:
    sys.stderr.write('FAIL: tls-handshake (pos={}) ranked above encryption-note (pos={})\n'.format(tls,enc))
    sys.exit(1)
PYEOF
rank_ok=$?
[[ $rank_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 4: breadcrumb field populated
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
# Find encryption-note result
r = next((x for x in data['results'] if 'encryption-note' in x['path']), None)
if not r:
    print('SKIP: encryption-note not in results, skipping breadcrumb check')
    sys.exit(0)
bc = r.get('breadcrumb', '')
if bc:
    print('PASS: breadcrumb populated: "{}"'.format(bc))
else:
    sys.stderr.write('FAIL: breadcrumb is empty\n')
    sys.exit(1)
PYEOF
bc_ok=$?
[[ $bc_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 5: custom limit respected
# ---------------------------------------------------------------------------
out_limit1="$(bash "$CONTEXT" "$VAULT" "encryption" 1 2>/dev/null)" || out_limit1=''
python3 - "$out_limit1" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
n = len(data.get('results', []))
if n <= 1:
    print('PASS: limit=1 respected ({} result(s))'.format(n))
else:
    sys.stderr.write('FAIL: limit=1 but got {} results\n'.format(n))
    sys.exit(1)
PYEOF
limit_ok=$?
[[ $limit_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 6: no-match query returns empty results with exit 0
# ---------------------------------------------------------------------------
out_none="$(bash "$CONTEXT" "$VAULT" "zzznomatchqueryzzzzzz" 2>/dev/null)" || out_none=''
python3 - "$out_none" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
n = len(data.get('results', []))
if n == 0:
    print('PASS: no-match query returns empty results[]')
else:
    sys.stderr.write('FAIL: expected 0 results, got {}\n'.format(n))
    sys.exit(1)
PYEOF
none_ok=$?
[[ $none_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 7: vault= parameter routing
# ---------------------------------------------------------------------------
out_vp="$(bash "$CONTEXT" "vault=${VAULT}" "encryption" 2>/dev/null)" || out_vp=''
assert_json_valid "$out_vp" "vault= parameter form returns valid JSON"

# ---------------------------------------------------------------------------
# Test 8: connections field parsed correctly
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
r = next((x for x in data['results'] if 'encryption-note' in x['path']), None)
if not r:
    print('SKIP: encryption-note not in results, skipping connections check')
    sys.exit(0)
conns = r.get('connections', [])
if conns:
    c = conns[0]
    required_keys = {'rel', 'target', 'context'}
    if required_keys.issubset(c.keys()):
        print('PASS: connections field has correct schema: {}'.format(c))
    else:
        sys.stderr.write('FAIL: connection missing keys: {}\n'.format(c))
        sys.exit(1)
else:
    print('PASS: connections field present (empty for this note)')
PYEOF
conn_ok=$?
[[ $conn_ok -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-context.sh: all assertions passed\n'
else
  printf '\ntest-context.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
