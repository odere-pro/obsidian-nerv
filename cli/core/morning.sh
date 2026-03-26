#!/usr/bin/env bash
# morning.sh — Orchestration skill: daily startup sequence
#
# Usage:
#   morning.sh [<vault>]
#   morning.sh [vault=<name>]
#
# Executes in sequence:
#   1. obsidian daily          — open today's daily note
#   2. obsidian daily:append   — append inbox backlog count
#   3. obsidian files           — list 10 most recently modified files
#   4. obsidian unresolved     — list unresolved wikilinks
#
# Exit codes: 0 success; 1 error.
#
# Install cron entry for weekday 08:00:
#   0 8 * * 1-5 /path/to/morning.sh vault=<name>
#
# STORY-015 — Implement weekly-review.sh and morning.sh orchestration skills
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
VAULT_ARG="${1:-}"
if [[ -n "$VAULT_ARG" ]]; then
  VAULT="$(resolve_vault "$VAULT_ARG")"
else
  VAULT="$(resolve_vault "")"
fi

# ---------------------------------------------------------------------------
# 1. Open today's daily note
# ---------------------------------------------------------------------------
obsidian daily vault="$VAULT" > /dev/null 2>&1 || true
printf '[morning] daily note opened\n'

# ---------------------------------------------------------------------------
# 2. Inbox backlog count — count notes in _inbox/ that are not processed
# ---------------------------------------------------------------------------
inbox_count="$(ob_eval "$VAULT" \
  "app.vault.getMarkdownFiles().filter(f => f.path.startsWith('_inbox/')).length" \
  2>/dev/null)" || inbox_count="0"
inbox_count="${inbox_count:-0}"

daily_append "$VAULT" "- Inbox backlog: ${inbox_count} note(s)" > /dev/null 2>&1 || true
printf '[morning] inbox backlog: %s note(s)\n' "$inbox_count"

# ---------------------------------------------------------------------------
# 3. Recent files (last 10 modified)
# ---------------------------------------------------------------------------
recent="$(obsidian files vault="$VAULT" sort=modified limit=10 2>/dev/null)" || recent=""
if [[ -n "$recent" ]]; then
  printf '[morning] recently modified files:\n%s\n' "$recent"
fi

# ---------------------------------------------------------------------------
# 4. Unresolved wikilinks
# ---------------------------------------------------------------------------
unresolved="$(obsidian unresolved vault="$VAULT" 2>/dev/null)" || unresolved=""
if [[ -n "$unresolved" ]]; then
  printf '[morning] unresolved wikilinks:\n%s\n' "$unresolved"
else
  printf '[morning] no unresolved wikilinks\n'
fi
