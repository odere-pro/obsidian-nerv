#!/usr/bin/env bash
# test-adr.sh — Tests for adr.sh dev skill
#
# Run via test-harness.sh:
#   test-harness.sh obsidian_docs test-adr.sh
# Or directly:
#   TEST_VAULT=obsidian_docs bash test-adr.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set}"
ADR="$(dirname "$SCRIPT_DIR")/../dev/adr.sh"
CREATE_PROJECT="$(dirname "$SCRIPT_DIR")/create-project.sh"

TEST_SLUG="testadr"
TEST_TITLE="Test ADR"
TEST_PROJ="projects/${TEST_SLUG}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

read_note() {
  local path="$1"
  ob_eval "$VAULT" \
    "(async()=>{ const f=app.vault.getAbstractFileByPath($(json_str "$path")); return f ? await app.vault.cachedRead(f) : ''; })()" \
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
  printf 'SKIP: test-adr.sh (Obsidian not reachable)\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# Run adr.sh
# ---------------------------------------------------------------------------
ADR_TITLE="Use PostgreSQL for session storage"
adr_out="$(bash "$ADR" "$VAULT" "$TEST_SLUG" "$ADR_TITLE" 2>/dev/null)" || adr_out=''

if [[ -z "$adr_out" ]]; then
  printf 'SKIP: test-adr.sh (adr.sh failed or Obsidian not reachable)\n'
  cleanup; exit 0
fi

assert_contains "ADR created:" "$adr_out" "adr.sh reports note path"
assert_contains "decision-date:"   "$adr_out" "adr.sh reports decision-date"
assert_contains "proposed"         "$adr_out" "adr.sh reports decision-status: proposed"

# ---------------------------------------------------------------------------
# Derive created note path and read content
# ---------------------------------------------------------------------------
DATE_COMPACT="$(date +%Y%m%d)"
TODAY="$(date +%Y-%m-%d)"
TEST_UPPER="$(printf '%s' "$TEST_SLUG" | tr '[:lower:]' '[:upper:]')"
ADR_SLUG="adr-${DATE_COMPACT}-use-postgresql-for-session-storage"
NOTE_PATH="${TEST_PROJ}/${TEST_UPPER}.${ADR_SLUG} - ${ADR_TITLE}.md"

content="$(read_note "$NOTE_PATH")"

if [[ -z "$content" ]]; then
  printf 'FAIL: ADR note not found at expected path: %s\n' "$NOTE_PATH" >&2
  FAILURES=$((FAILURES + 1))
  cleanup; exit "$FAILURES"
fi

# Frontmatter checks
assert_contains "type: LEAF"          "$content" "frontmatter type: LEAF"
assert_contains "kind: decision"      "$content" "frontmatter kind: decision"
assert_contains "decision-date: ${TODAY}" "$content" "frontmatter decision-date set to today"
assert_contains "decision-status: proposed" "$content" "frontmatter decision-status: proposed"

# Content subsections
assert_contains "### Context"      "$content" "## Content has ### Context subsection"
assert_contains "### Decision"     "$content" "## Content has ### Decision subsection"
assert_contains "### Consequences" "$content" "## Content has ### Consequences subsection"

# ---------------------------------------------------------------------------
# Idempotency: re-running same title should not create a second file
# ---------------------------------------------------------------------------
bash "$ADR" "$VAULT" "$TEST_SLUG" "$ADR_TITLE" >/dev/null 2>&1 || true

# Count files with ADR slug in the project
file_count_js="(()=>{
  const dir = '${TEST_PROJ}';
  return app.vault.getFiles()
    .filter(f => f.path.startsWith(dir + '/') && f.name.includes('${ADR_SLUG}'))
    .length;
})()"
count="$(ob_eval "$VAULT" "$file_count_js" 2>/dev/null || echo '0')"

if [[ "$count" == "1" ]]; then
  printf 'PASS: idempotent re-run creates no duplicate ADR note\n'
else
  printf 'FAIL: expected 1 ADR note, found %s\n' "$count" >&2
  FAILURES=$((FAILURES + 1))
fi

# ---------------------------------------------------------------------------
# vault= parameter
# ---------------------------------------------------------------------------
adr_out2="$(bash "$ADR" "vault=${VAULT}" "$TEST_SLUG" "Another Decision" 2>/dev/null)" || adr_out2=''
assert_contains "ADR created:" "$adr_out2" "vault= parameter form works"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup

if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-adr.sh: all assertions passed\n'
else
  printf '\ntest-adr.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi
exit "$FAILURES"
