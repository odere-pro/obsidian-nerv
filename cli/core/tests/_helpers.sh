#!/usr/bin/env bash
# _helpers.sh — Shared assertion helpers for ontology CLI test files.
#
# Source this file at the top of every test-*.sh:
#   source "$(dirname "$0")/_helpers.sh"
#
# Convention: each test file exits with $FAILURES (0 = all pass, N = N failures).
# The FAILURES variable is owned by the sourcing test file — reset it yourself
# before sourcing if needed (it starts at 0 here).

FAILURES=0

# ---------------------------------------------------------------------------
# assert_eq <expected> <actual> <message>
# Pass when expected == actual (exact string match).
# ---------------------------------------------------------------------------
assert_eq() {
  local expected="$1" actual="$2" msg="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf 'PASS: %s\n' "$msg"
  else
    printf 'FAIL: %s\n  expected: %s\n  actual:   %s\n' "$msg" "$expected" "$actual" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

# ---------------------------------------------------------------------------
# assert_contains <needle> <haystack> <message>
# Pass when haystack contains needle as a substring.
# ---------------------------------------------------------------------------
assert_contains() {
  local needle="$1" haystack="$2" msg="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    printf 'PASS: %s\n' "$msg"
  else
    printf 'FAIL: %s\n  expected to contain: %s\n  got: %s\n' "$msg" "$needle" "$haystack" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

# ---------------------------------------------------------------------------
# assert_exit_ok <message> -- <command> [args...]
# Pass when command exits 0.  Everything after -- is the command.
#
# Usage:
#   assert_exit_ok "daily_append works" -- daily_append "$VAULT" "content"
# ---------------------------------------------------------------------------
assert_exit_ok() {
  local msg="$1"; shift
  [[ "$1" == "--" ]] && shift
  if "$@" > /dev/null 2>&1; then
    printf 'PASS: %s\n' "$msg"
  else
    printf 'FAIL: %s (command exited non-zero)\n' "$msg" >&2
    FAILURES=$((FAILURES + 1))
  fi
}

# ---------------------------------------------------------------------------
# assert_json_valid <json_string> <message>
# Pass when the string is valid JSON (validated by python3 -m json.tool).
# ---------------------------------------------------------------------------
assert_json_valid() {
  local json="$1" msg="$2"
  if printf '%s' "$json" | python3 -m json.tool > /dev/null 2>&1; then
    printf 'PASS: %s\n' "$msg"
  else
    printf 'FAIL: %s (invalid JSON: %s)\n' "$msg" "$json" >&2
    FAILURES=$((FAILURES + 1))
  fi
}
