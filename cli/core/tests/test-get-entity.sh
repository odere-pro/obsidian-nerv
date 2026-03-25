#!/usr/bin/env bash
# test-get-entity.sh — Tests for get-entity.sh sensory skill
#
# Creates a small project with two linked notes, runs get-entity.sh queries,
# and validates JSON output structure, sections, backlinks, and outgoing links.
#
# Run via test-harness.sh:
#   test-harness.sh obsidian_docs test-get-entity.sh
# Or directly:
#   TEST_VAULT=obsidian_docs bash test-get-entity.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set}"
GET_ENTITY="$(dirname "$SCRIPT_DIR")/get-entity.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testge"
TEST_TITLE="Test GetEntity"
TEST_PROJ="projects/${TEST_SLUG}"
TEST_UPPER="TESTGE"

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
  printf 'SKIP: test-get-entity.sh (Obsidian not reachable)\n'
  exit 0
fi

# Note A: "alpha-concept" — has Summary/Content/Connections sections, links to Note B
NOTE_A_PATH="${TEST_PROJ}/${TEST_UPPER}.alpha-concept - Alpha Concept.md"
NOTE_A_BASENAME="${TEST_UPPER}.alpha-concept - Alpha Concept"
create_note "$NOTE_A_PATH" \
"---
title: Alpha Concept
aliases:
  - Alpha
  - alpha-alias
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
  - alpha
---

## Summary
This is the summary of Alpha Concept.
## Content
Alpha Concept covers foundational ideas about alpha-level thinking.
It references Beta Concept for comparison purposes.
## Connections
- related-to :: [[${TEST_UPPER}.beta-concept - Beta Concept]]
## Flags
"

# Note B: "beta-concept" — linked to by Note A (backlinks test)
NOTE_B_PATH="${TEST_PROJ}/${TEST_UPPER}.beta-concept - Beta Concept.md"
NOTE_B_BASENAME="${TEST_UPPER}.beta-concept - Beta Concept"
create_note "$NOTE_B_PATH" \
"---
title: Beta Concept
aliases: []
type: LEAF
kind: reference
spine: ${TEST_SLUG}
status: draft
parent: \"[[${TEST_UPPER}.ROOT - ${TEST_TITLE}]]\"
children: []
attachments: []
created: 2025-01-01
modified: 2025-01-01
---

## Summary
Beta Concept is a reference note.
## Content
Beta Concept provides supplementary material.
## Connections
## Flags
"

# Allow metadataCache to settle
sleep 1

# ---------------------------------------------------------------------------
# Test 1: exact match by full basename — returns valid JSON
# ---------------------------------------------------------------------------
out1="$(bash "$GET_ENTITY" "$VAULT" "$NOTE_A_BASENAME" 2>/dev/null)" || out1=''

if [[ -z "$out1" ]]; then
  printf 'SKIP: test-get-entity.sh (Obsidian not reachable)\n'
  cleanup
  exit 0
fi

assert_json_valid "$out1" "get-entity returns valid JSON for exact match"
assert_contains '"path"'        "$out1" "JSON has path field"
assert_contains '"matchType"'   "$out1" "JSON has matchType field"
assert_contains '"frontmatter"' "$out1" "JSON has frontmatter field"
assert_contains '"sections"'    "$out1" "JSON has sections field"
assert_contains '"backlinks"'   "$out1" "JSON has backlinks field"
assert_contains '"outgoing"'    "$out1" "JSON has outgoing field"

# ---------------------------------------------------------------------------
# Test 2: matchType is "exact" for full basename
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
mt = data.get('matchType', '')
if mt == 'exact':
    print('PASS: matchType is "exact" for full basename match')
else:
    sys.stderr.write('FAIL: matchType expected "exact", got "{}"\n'.format(mt))
    sys.exit(1)
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 3: correct note path returned
# ---------------------------------------------------------------------------
python3 - "$out1" "$NOTE_A_PATH" <<'PYEOF'
import json, sys
data      = json.loads(sys.argv[1])
expected  = sys.argv[2]
actual    = data.get('path', '')
if actual == expected:
    print('PASS: path matches expected note path')
else:
    sys.stderr.write('FAIL: path mismatch\n  expected: {}\n  actual:   {}\n'.format(expected, actual))
    sys.exit(1)
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 4: frontmatter fields populated
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
fm   = data.get('frontmatter', {})
required = ['title', 'type', 'kind', 'spine', 'status']
missing  = [k for k in required if k not in fm]
if missing:
    sys.stderr.write('FAIL: frontmatter missing keys: {}\n'.format(missing))
    sys.exit(1)
print('PASS: frontmatter has all required keys ({})'.format(list(fm.keys())))
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 5: sections parsed — Summary, Content, Connections present
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data     = json.loads(sys.argv[1])
sections = data.get('sections', {})
required = ['Summary', 'Content', 'Connections']
missing  = [s for s in required if s not in sections]
if missing:
    sys.stderr.write('FAIL: sections missing: {}\n'.format(missing))
    sys.exit(1)
# Verify section content is non-empty for Summary
if not sections.get('Summary', '').strip():
    sys.stderr.write('FAIL: Summary section is empty\n')
    sys.exit(1)
print('PASS: sections parsed correctly, Summary: "{}"'.format(sections['Summary'][:50]))
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 6: outgoing links populated (Note A links to Note B)
# ---------------------------------------------------------------------------
python3 - "$out1" <<'PYEOF'
import json, sys
data    = json.loads(sys.argv[1])
outgoing = data.get('outgoing', [])
if not outgoing:
    sys.stderr.write('FAIL: outgoing links empty, expected link to beta-concept\n')
    sys.exit(1)
# Each entry must have path, title, display
o = outgoing[0]
required = {'path', 'title', 'display'}
missing  = required - set(o.keys())
if missing:
    sys.stderr.write('FAIL: outgoing entry missing keys: {}\n'.format(missing))
    sys.exit(1)
print('PASS: outgoing links present with correct schema: {}'.format(o))
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 7: partial match by normalized slug
# ---------------------------------------------------------------------------
out_partial="$(bash "$GET_ENTITY" "$VAULT" "alpha-concept" 2>/dev/null)" || out_partial=''
assert_json_valid "$out_partial" "get-entity returns valid JSON for partial slug match"

python3 - "$out_partial" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
mt   = data.get('matchType', '')
if mt == 'partial':
    print('PASS: matchType is "partial" for slug-only match')
else:
    sys.stderr.write('FAIL: matchType expected "partial", got "{}"\n'.format(mt))
    sys.exit(1)
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 8: alias match — find Note A by alias "alpha-alias"
# ---------------------------------------------------------------------------
out_alias="$(bash "$GET_ENTITY" "$VAULT" "alpha-alias" 2>/dev/null)" || out_alias=''
assert_json_valid "$out_alias" "get-entity returns valid JSON for alias match"

python3 - "$out_alias" "$NOTE_A_PATH" <<'PYEOF'
import json, sys
data     = json.loads(sys.argv[1])
expected = sys.argv[2]
actual   = data.get('path', '')
if actual == expected:
    print('PASS: alias match resolves to correct note')
else:
    sys.stderr.write('FAIL: alias match returned wrong path\n  expected: {}\n  actual:   {}\n'.format(expected, actual))
    sys.exit(1)
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 9: backlinks on Note B — should list Note A as a backlink
# ---------------------------------------------------------------------------
out_b="$(bash "$GET_ENTITY" "$VAULT" "$NOTE_B_BASENAME" 2>/dev/null)" || out_b=''
assert_json_valid "$out_b" "get-entity returns valid JSON for Note B"

python3 - "$out_b" "$NOTE_A_PATH" <<'PYEOF'
import json, sys
data     = json.loads(sys.argv[1])
note_a   = sys.argv[2]
backlinks = data.get('backlinks', [])
bl_paths  = [b.get('path', '') for b in backlinks]
if any(note_a in p for p in bl_paths):
    print('PASS: Note B backlinks include Note A')
else:
    sys.stderr.write('FAIL: Note A not found in Note B backlinks: {}\n'.format(bl_paths))
    sys.exit(1)
# Verify backlink schema includes type/kind/spine
if backlinks:
    b = backlinks[0]
    required = {'path', 'title', 'type', 'kind', 'spine'}
    missing  = required - set(b.keys())
    if missing:
        sys.stderr.write('FAIL: backlink entry missing keys: {}\n'.format(missing))
        sys.exit(1)
    print('PASS: backlink entry has correct schema: {}'.format(b))
PYEOF
[[ $? -ne 0 ]] && FAILURES=$((FAILURES + 1))

# ---------------------------------------------------------------------------
# Test 10: no-match error — exits 1, emits stderr
# ---------------------------------------------------------------------------
err_out="$(bash "$GET_ENTITY" "$VAULT" "zzznomatchqueryzzzz" 2>&1)" && no_match_exit=0 || no_match_exit=$?
if [[ $no_match_exit -ne 0 ]]; then
  printf 'PASS: no-match exits 1\n'
else
  printf 'FAIL: no-match query should exit 1 but exited 0\n' >&2
  FAILURES=$((FAILURES + 1))
fi
assert_contains 'no note matches' "$err_out" "no-match error message on stderr"

# ---------------------------------------------------------------------------
# Test 11: ambiguous match error — two notes whose basenames both contain "concept"
# ---------------------------------------------------------------------------
err_ambig="$(bash "$GET_ENTITY" "$VAULT" "concept" 2>&1)" && ambig_exit=0 || ambig_exit=$?
if [[ $ambig_exit -ne 0 ]]; then
  printf 'PASS: ambiguous match exits 1\n'
else
  printf 'FAIL: ambiguous match should exit 1 but exited 0\n' >&2
  FAILURES=$((FAILURES + 1))
fi
assert_contains 'ambiguous match' "$err_ambig" "ambiguous match error message on stderr"

# ---------------------------------------------------------------------------
# Test 12: vault= parameter form works
# ---------------------------------------------------------------------------
out_vp="$(bash "$GET_ENTITY" "vault=${VAULT}" "$NOTE_A_BASENAME" 2>/dev/null)" || out_vp=''
assert_json_valid "$out_vp" "vault= parameter form returns valid JSON"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-get-entity.sh: all assertions passed\n'
else
  printf '\ntest-get-entity.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
