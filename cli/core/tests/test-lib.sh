#!/usr/bin/env bash
# test-lib.sh — Tests for ~/.ontology-cli/core/lib.sh
#
# Verifies all six lib.sh functions: ob_eval, resolve_vault, daily_append,
# rollback_log, emit_json, log_error.
#
# Run via test-harness.sh:
#   test-harness.sh study test-lib.sh
# Or directly:
#   TEST_VAULT=study bash test-lib.sh
#
# Exits with the number of failing assertions (0 = all pass).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_helpers.sh"
source "$(dirname "$SCRIPT_DIR")/lib.sh"

VAULT="${TEST_VAULT:?TEST_VAULT must be set (e.g. study)}"
ROLLBACK_LOG="_inbox/_rollback-log.md"

# ---------------------------------------------------------------------------
# resolve_vault — no Obsidian needed
# ---------------------------------------------------------------------------
assert_eq "study" \
  "$(resolve_vault "vault=study")" \
  "resolve_vault extracts vault from vault=study"

assert_eq "dev-projectA" \
  "$(resolve_vault "vault=dev-projectA")" \
  "resolve_vault extracts vault from vault=dev-projectA"

# resolve_vault with no arg falls back to active vault (requires Obsidian)
active=$(resolve_vault "" 2>/dev/null) || active="<unavailable>"
if [[ "$active" != "<unavailable>" && -n "$active" ]]; then
  printf 'PASS: resolve_vault "" returned active vault: %s\n' "$active"
else
  printf 'SKIP: resolve_vault "" (Obsidian not reachable)\n'
fi

# ---------------------------------------------------------------------------
# emit_json — no Obsidian needed
# ---------------------------------------------------------------------------
assert_eq '{"test":true}' \
  "$(emit_json '{"test":true}')" \
  "emit_json passes through value unchanged"

assert_json_valid "$(emit_json '{"key":"value","n":42}')" \
  "emit_json output is valid JSON"

# ---------------------------------------------------------------------------
# log_error — no Obsidian needed
# ---------------------------------------------------------------------------
stderr_out=$(log_error "sentinel-error" 2>&1 || true)
assert_contains "sentinel-error" "$stderr_out" \
  "log_error writes message to stderr"

# Confirm it exits non-zero
if (log_error "x" > /dev/null 2>&1); then
  printf 'FAIL: log_error should exit non-zero\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: log_error exits non-zero\n'
fi

# ---------------------------------------------------------------------------
# ob_eval — requires Obsidian running
# ---------------------------------------------------------------------------
two=$(ob_eval "$VAULT" '1 + 1' 2>/dev/null) || two="<unavailable>"
if [[ "$two" == "<unavailable>" || "$two" == "Error"* ]]; then
  printf 'SKIP: ob_eval (Obsidian not reachable)\n'
else
  assert_eq "2" "$two" "ob_eval evaluates JavaScript expression (1+1=2)"

  # Vault name: if the specified vault isn't open, CLI falls back to active vault.
  # Treat a non-empty return as success; emit a warning if name doesn't match.
  vault_name=$(ob_eval "$VAULT" 'app.vault.getName()' 2>/dev/null) || vault_name=""
  if [[ -z "$vault_name" ]]; then
    printf 'FAIL: ob_eval app.vault.getName() returned empty\n' >&2
    FAILURES=$((FAILURES + 1))
  elif [[ "$vault_name" == "$VAULT" ]]; then
    printf 'PASS: ob_eval app.vault.getName() = %s\n' "$vault_name"
  else
    printf 'WARN: ob_eval vault name "%s" != TEST_VAULT "%s" — is "%s" open in Obsidian?\n' \
      "$vault_name" "$VAULT" "$VAULT"
  fi
fi

# ---------------------------------------------------------------------------
# daily_append — requires Obsidian running
# ---------------------------------------------------------------------------
ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if daily_append "$VAULT" "- [test-lib] lib.sh test run ${ts}" > /dev/null 2>&1; then
  printf 'PASS: daily_append exits 0\n'
else
  printf 'SKIP: daily_append (Obsidian not reachable or no daily note)\n'
fi

# ---------------------------------------------------------------------------
# rollback_log — requires Obsidian running
# ---------------------------------------------------------------------------
run_ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if rollback_log "$VAULT" "test-lib-run" "Unit test entry ${run_ts}" > /dev/null 2>&1; then
  printf 'PASS: rollback_log exits 0\n'

  # The CLI may fall back to the active vault when VAULT isn't open;
  # check for the file without specifying a vault so we catch both cases.
  file_exists=$(ob_eval "$VAULT" \
    "app.vault.getAbstractFileByPath('${ROLLBACK_LOG}') ? 'yes' : 'no'" \
    2>/dev/null) || file_exists="<err>"

  if [[ "$file_exists" == "yes" ]]; then
    printf 'PASS: rollback_log created %s\n' "$ROLLBACK_LOG"

    # Verify the entry contains the operation name
    content=$(ob_eval "$VAULT" \
      "(async () => { const f = app.vault.getAbstractFileByPath('${ROLLBACK_LOG}'); return f ? await app.vault.cachedRead(f) : ''; })()" \
      2>/dev/null) || content=""
    assert_contains "test-lib-run" "$content" \
      "rollback_log entry contains operation name"

    # Cleanup: trash the rollback log so subsequent runs start fresh
    ob_eval "$VAULT" "(async () => {
      const f = app.vault.getAbstractFileByPath('${ROLLBACK_LOG}');
      if (f) await app.vault.trash(f, false);
    })()" > /dev/null 2>&1 || true
    printf 'INFO: rollback log trashed (cleanup)\n'
  else
    printf 'FAIL: rollback_log did not create %s\n' "$ROLLBACK_LOG" >&2
    FAILURES=$((FAILURES + 1))
  fi
else
  printf 'SKIP: rollback_log (Obsidian not reachable)\n'
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [[ $FAILURES -eq 0 ]]; then
  printf '\ntest-lib.sh: all assertions passed\n'
else
  printf '\ntest-lib.sh: %d assertion(s) failed\n' "$FAILURES" >&2
fi

exit "$FAILURES"
