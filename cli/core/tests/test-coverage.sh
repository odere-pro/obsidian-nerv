#!/usr/bin/env bash
# test-coverage.sh — Tests for coverage.sh study skill
#
# Creates a test project with notes across two spines and three statuses,
# then validates the JSON output shape, per-domain counts, and coverage math.
#
# Run via test-harness.sh:
#   test-harness.sh study test-coverage.sh
# Or directly:
#   TEST_VAULT=study bash test-coverage.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
CORE_DIR="$(dirname "$SCRIPT_DIR")"
STUDY_DIR="$(dirname "$CORE_DIR")/study"
SKILL="$STUDY_DIR/coverage.sh"
CREATE_PROJECT="$CORE_DIR/create-project.sh"

TEST_SLUG="testcov"
TEST_UPPER="TESTCOV"
TEST_PROJ="projects/${TEST_SLUG}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

ob_create_note() {
  local path="$1" content="$2" jp jc
  jp="$(json_str "$path")"
  jc="$(json_str "$content")"
  ob_eval "$VAULT" \
    "(async () => { await app.vault.create(${jp}, ${jc}); })()" > /dev/null
}

cleanup() {
  ob_eval "$VAULT" "(async () => {
    var f = app.vault.getAbstractFileByPath('${TEST_PROJ}');
    if (f) await app.vault.trash(f, false);
  })()" > /dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# Arg validation
# ---------------------------------------------------------------------------
if bash "$SKILL" 2>/dev/null; then
  printf 'FAIL: coverage.sh should exit non-zero with no args\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: coverage.sh exits non-zero with no args\n'
fi

# ---------------------------------------------------------------------------
# Obsidian reachability
# ---------------------------------------------------------------------------
cleanup

if ! bash "$CREATE_PROJECT" "$VAULT" "$TEST_SLUG" "Test Coverage" > /dev/null 2>&1; then
  printf 'SKIP: test-coverage.sh (Obsidian not reachable or create-project.sh failed)\n'
  exit 0
fi
printf 'PASS: test project created\n'

# ---------------------------------------------------------------------------
# Create notes: 2 spines × mixed statuses
#   spine "alpha": 2 stable, 1 review, 1 draft  → coverage = 2/4 = 50.0
#   spine "beta":  1 stable, 0 review, 1 draft  → coverage = 1/2 = 50.0
# ---------------------------------------------------------------------------
make_note() {
  local slug="$1" title="$2" spine="$3" status="$4"
  ob_create_note "${TEST_PROJ}/${TEST_UPPER}.${slug} - ${title}.md" \
"---
title: \"${title}\"
aliases: []
type: LEAF
kind: concept
spine: ${spine}
status: ${status}
parent: \"\"
children: []
attachments: []
created: 2026-01-01
modified: 2026-01-01
---

## Summary

Summary for ${title}.

## Content

$(printf 'word%.0s ' {1..50})

## Connections

## Flags
"
}

make_note "alpha-1" "Alpha One"   "alpha" "stable"
make_note "alpha-2" "Alpha Two"   "alpha" "stable"
make_note "alpha-3" "Alpha Three" "alpha" "review"
make_note "alpha-4" "Alpha Four"  "alpha" "draft"
make_note "beta-1"  "Beta One"    "beta"  "stable"
make_note "beta-2"  "Beta Two"    "beta"  "draft"
printf 'PASS: test notes created\n'

# ---------------------------------------------------------------------------
# Run coverage.sh
# ---------------------------------------------------------------------------
cov_out="$(bash "$SKILL" "$VAULT" "$TEST_SLUG" 2>&1)"
cov_exit=$?

if [[ $cov_exit -eq 0 ]]; then
  printf 'PASS: coverage.sh exits 0\n'
else
  printf 'FAIL: coverage.sh exited %d\n' "$cov_exit" >&2
  FAILURES=$((FAILURES + 1))
fi

assert_json_valid "$cov_out" "output is valid JSON"
assert_contains '"project"'  "$cov_out" "output has project key"
assert_contains '"domains"'  "$cov_out" "output has domains key"
assert_contains '"overall"'  "$cov_out" "output has overall key"
assert_contains '"coverage"' "$cov_out" "domain entries have coverage field"
assert_contains '"stable"'   "$cov_out" "domain entries have stable field"
assert_contains '"review"'   "$cov_out" "domain entries have review field"
assert_contains '"draft"'    "$cov_out" "domain entries have draft field"
assert_contains '"total"'    "$cov_out" "domain entries have total field"
assert_contains '"alpha"'    "$cov_out" "alpha spine present in domains"
assert_contains '"beta"'     "$cov_out" "beta spine present in domains"
assert_contains '"avgCoverage"' "$cov_out" "overall has avgCoverage"
assert_contains '"totalNotes"'  "$cov_out" "overall has totalNotes"

# Verify alpha domain counts via Python
python3 - "$cov_out" <<'PYEOF'
import json, sys

data    = json.loads(sys.argv[1])
domains = {d['spine']: d for d in data['domains']}
alpha   = domains.get('alpha', {})
beta    = domains.get('beta',  {})

failures = 0

def chk(cond, msg):
    global failures
    if cond:
        print('PASS: ' + msg)
    else:
        print('FAIL: ' + msg, file=sys.stderr)
        failures += 1

chk(alpha.get('total')  == 4,    'alpha total == 4')
chk(alpha.get('stable') == 2,    'alpha stable == 2')
chk(alpha.get('review') == 1,    'alpha review == 1')
chk(alpha.get('draft')  == 1,    'alpha draft == 1')
chk(alpha.get('coverage') == 50.0, 'alpha coverage == 50.0')

chk(beta.get('total')   == 2,    'beta total == 2')
chk(beta.get('stable')  == 1,    'beta stable == 1')
chk(beta.get('coverage') == 50.0, 'beta coverage == 50.0')

ov = data.get('overall', {})
chk(ov.get('totalNotes') == 6,   'overall totalNotes == 6')

sys.exit(failures)
PYEOF
PYEOF_EXIT=$?
FAILURES=$((FAILURES + PYEOF_EXIT))

# ---------------------------------------------------------------------------
# Invalid slug
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
  printf '\ntest-coverage.sh: all assertions passed\n'
else
  printf '\ntest-coverage.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
