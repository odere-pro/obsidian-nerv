#!/usr/bin/env bash
# lib.sh — Obsidian Nerv core library
# Source this file in every CLI skill: source ~/.ontology-cli/core/lib.sh
# Do NOT execute directly (no side effects at source time).
#
# STORY-003 — Implement core library
# Requires: Obsidian v1.12.4+ running with CLI registered (Limitation L1).

LIB_VERSION="1.0.0"

# Print version and exit when invoked directly with --version
if [[ "${BASH_SOURCE[0]}" == "${0}" && "${1:-}" == "--version" ]]; then
  echo "lib.sh $LIB_VERSION"
  exit 0
fi

# ---------------------------------------------------------------------------
# log_error <message>
# Write message to stderr and exit 1.
# ---------------------------------------------------------------------------
log_error() {
  printf '%s\n' "ERROR: $1" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# resolve_vault <arg>
# Return vault name from a "vault=<name>" argument, or fall back to the
# currently active vault via `obsidian vault`.
#
# Usage:
#   resolve_vault "vault=study"   # → "study"
#   resolve_vault ""              # → active vault name
# ---------------------------------------------------------------------------
resolve_vault() {
  local arg="${1:-}"
  if [[ "$arg" == vault=* ]]; then
    echo "${arg#vault=}"
  else
    # obsidian vault → prints the active vault's display name
    obsidian vault 2>/dev/null \
      || log_error "Could not determine active vault. Pass vault=<name> explicitly."
  fi
}

# ---------------------------------------------------------------------------
# ob_eval <vault> <expr>
# Run a JavaScript expression inside the named Obsidian vault and print the
# result to stdout.
#
# The expression is passed as a positional argument — do NOT use code= prefix.
# Requires Obsidian to be running (Limitation L1).
#
# SECURITY: Never pass user-supplied, unvalidated strings as <expr>.
#           Always build the expression in the caller with safely-encoded
#           values (e.g. JSON-encode strings via python3 before embedding).
#
# Usage:
#   ob_eval study 'app.vault.getName()'
# ---------------------------------------------------------------------------
ob_eval() {
  local vault="$1"
  local expr="$2"
  [[ -z "$vault" ]] && log_error "ob_eval: vault argument is required"
  [[ -z "$expr"  ]] && log_error "ob_eval: expr argument is required"
  obsidian eval vault="$vault" "$expr"
}

# ---------------------------------------------------------------------------
# daily_append <vault> <content>
# Append a line of content to today's daily note in <vault>.
# Creates the daily note if it does not yet exist.
# ---------------------------------------------------------------------------
daily_append() {
  local vault="$1"
  local content="$2"
  [[ -z "$vault"   ]] && log_error "daily_append: vault argument is required"
  [[ -z "$content" ]] && log_error "daily_append: content argument is required"
  obsidian daily:append vault="$vault" content="$content"
}

# ---------------------------------------------------------------------------
# emit_json <data>
# Write a JSON string to stdout.
# Caller is responsible for providing valid JSON.
# ---------------------------------------------------------------------------
emit_json() {
  local data="$1"
  printf '%s\n' "$data"
}

# ---------------------------------------------------------------------------
# rollback_log <vault> <operation> <partial_state>
# Append a structured entry to _inbox/_rollback-log.md in <vault>.
# Creates the file (with a header) if it does not yet exist.
#
# Entry format (Markdown table row):
#   | ISO-timestamp | operation | partial_state |
#
# Newlines in partial_state are replaced with spaces to prevent log injection.
# Uses ob_eval + Obsidian JS API so writes route through the Obsidian runtime.
# ---------------------------------------------------------------------------
rollback_log() {
  local vault="$1"
  local operation="$2"
  local partial_state="$3"
  [[ -z "$vault"         ]] && log_error "rollback_log: vault is required"
  [[ -z "$operation"     ]] && log_error "rollback_log: operation is required"
  [[ -z "$partial_state" ]] && log_error "rollback_log: partial_state is required"

  # Sanitize: collapse newlines so the entry stays on one table row
  local safe_state="${partial_state//$'\n'/ }"

  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  local entry="| ${timestamp} | ${operation} | ${safe_state} |"

  # JSON-encode the strings that will be embedded in the JS expression so that
  # pipes, backslashes, and quotes cannot break the JavaScript syntax.
  local js_entry js_header
  js_entry="$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$entry")"
  js_header="$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" \
    "# Rollback Log

Entries written by CLI skills on partial failure. Operator triage required.

| Timestamp | Operation | Partial State |
|-----------|-----------|---------------|
")"

  local js
  js="(async () => {
    const path = '_inbox/_rollback-log.md';
    const f = app.vault.getAbstractFileByPath(path);
    if (f) {
      await app.vault.append(f, ${js_entry} + '\n');
    } else {
      await app.vault.create(path, ${js_header} + ${js_entry} + '\n');
    }
  })()"

  ob_eval "$vault" "$js"
}
