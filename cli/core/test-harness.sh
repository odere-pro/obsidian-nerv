#!/usr/bin/env bash
# test-harness.sh — Incremental test runner for ontology CLI skills
#
# Usage:
#   test-harness.sh <vault>               # run all test-*.sh in tests/
#   test-harness.sh <vault> test-lib.sh   # run one named test file
#
# STORY-004 — Build incremental test harness
# Requires: Obsidian v1.12.4+ running (Limitation L1).
set -uo pipefail

CORE_DIR="$(cd "$(dirname "$0")" && pwd)"
TESTS_DIR="$CORE_DIR/tests"

source "$CORE_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  printf 'Usage: %s <vault> [test-file.sh]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$1"
SPECIFIC_TEST="${2:-}"

export TEST_VAULT="$VAULT"
export TEST_PROJECT="projects/_test-project"

# ---------------------------------------------------------------------------
# Setup — create disposable test project with a ROOT note via Obsidian API.
# ---------------------------------------------------------------------------
setup() {
  printf '[harness] Creating test project...\n'
  ob_eval "$VAULT" "(async () => {
    const folder = '_test-project';
    const exists = app.vault.getAbstractFileByPath('projects/' + folder);
    if (!exists) await app.vault.createFolder('projects/' + folder);
    const rootPath = 'projects/' + folder + '/_TEST.ROOT - Test Project.md';
    const rootExists = app.vault.getAbstractFileByPath(rootPath);
    if (!rootExists) await app.vault.create(rootPath,
      '---\ntype: ROOT\ntitle: Test Project\nkind: concept\nspine: _test\nstatus: draft\nparent: \"\"\nchildren: []\ncreated: ' +
      new Date().toISOString().split('T')[0] + '\nmodified: ' +
      new Date().toISOString().split('T')[0] + '\n---\n\n## Summary\n\nDisposable test project — created by test-harness.sh.\n');
  })()" > /dev/null
}

# ---------------------------------------------------------------------------
# Teardown — trash the test project folder through the Obsidian runtime.
# Never use rm — trash preserves link integrity.
# ---------------------------------------------------------------------------
teardown() {
  printf '[harness] Cleaning up test project...\n'
  ob_eval "$VAULT" "(async () => {
    const folder = app.vault.getAbstractFileByPath('${TEST_PROJECT}');
    if (folder) await app.vault.trash(folder, false);
  })()" > /dev/null 2>&1 || true
}

trap teardown EXIT

# ---------------------------------------------------------------------------
# Collect test files
# ---------------------------------------------------------------------------
if [[ -n "$SPECIFIC_TEST" ]]; then
  # Accept bare name or full path
  if [[ "$SPECIFIC_TEST" == /* ]]; then
    test_file_list="$SPECIFIC_TEST"
  else
    test_file_list="$TESTS_DIR/$SPECIFIC_TEST"
  fi
else
  # Glob all test-*.sh files; sort for deterministic order
  test_file_list=""
  for f in "$TESTS_DIR"/test-*.sh; do
    [[ -f "$f" ]] && test_file_list="$test_file_list $f"
  done
  test_file_list="${test_file_list# }"  # strip leading space
fi

if [[ -z "$test_file_list" ]]; then
  printf 'No test files found in %s\n' "$TESTS_DIR" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Run tests
# ---------------------------------------------------------------------------
setup

PASSED=0
FAILED=0
FAILED_NAMES=""

for test_file in $test_file_list; do
  if [[ ! -f "$test_file" ]]; then
    printf 'SKIP: %s (not found)\n' "$test_file" >&2
    continue
  fi

  test_name="$(basename "$test_file")"
  printf '\n── %s ──\n' "$test_name"

  bash "$test_file"
  exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    PASSED=$((PASSED + 1))
    printf '[PASS] %s\n' "$test_name"
  else
    FAILED=$((FAILED + 1))
    FAILED_NAMES="$FAILED_NAMES $test_name"
    printf '[FAIL] %s (exit %d)\n' "$test_name" "$exit_code" >&2
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"

if [[ $FAILED -gt 0 ]]; then
  printf 'Failed tests:\n' >&2
  for name in $FAILED_NAMES; do
    printf '  %s\n' "$name" >&2
  done
  exit 1
fi

exit 0
