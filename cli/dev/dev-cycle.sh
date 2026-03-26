#!/usr/bin/env bash
# dev-cycle.sh — Dev skill: run the full plugin development feedback cycle
#
# Usage:
#   dev-cycle.sh <vault> <plugin-id> [--screenshot]
#   dev-cycle.sh vault=<name> <plugin-id> [--screenshot]
#
# Executes the 4-step feedback cycle:
#   1. obsidian plugin:reload <plugin-id>   — hot-reload the plugin
#   2. obsidian dev:errors                  — check for JS errors; stop if found
#   3. obsidian dev:console                 — show last 20 lines of console output
#   4. obsidian dev:screenshot              — capture viewport (only with --screenshot)
#
# <plugin-id> is the directory name under .obsidian/plugins/, NOT the display name.
# Example: "my-plugin" not "My Plugin".
#
# Exit codes: 0 cycle complete (errors may still be present in output);
#             1 plugin reload failed or arg error.
#
# STORY-030 — Add plugin development cycle tooling to dev skills
# Requires: lib.sh, Obsidian running with obsidian-cli skill (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../core" && pwd)"
source "$CORE_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
SCREENSHOT=false
_ARGS=()
for _a in "$@"; do
  [[ "$_a" == "--screenshot" ]] && SCREENSHOT=true || _ARGS+=("$_a")
done

if [[ ${#_ARGS[@]} -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> <plugin-id> [--screenshot]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "${_ARGS[0]}")"
PLUGIN_ID="${_ARGS[1]}"

# Basic validation: plugin-id must be a filesystem-safe identifier
if [[ ! "$PLUGIN_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  printf 'ERROR: dev-cycle: plugin-id must contain only letters, digits, hyphens, or underscores\n' >&2
  printf '       Pass the directory name from .obsidian/plugins/, not the display name.\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 1 — Reload
# ---------------------------------------------------------------------------
printf '[dev-cycle] Step 1/4: reloading plugin "%s"...\n' "$PLUGIN_ID"
if ! obsidian plugin:reload vault="$VAULT" plugin="$PLUGIN_ID" 2>/dev/null; then
  printf 'ERROR: dev-cycle: plugin:reload failed for "%s"\n' "$PLUGIN_ID" >&2
  printf '       Verify the plugin ID matches the directory under .obsidian/plugins/\n' >&2
  exit 1
fi
printf '[dev-cycle] Reload: OK\n'

# ---------------------------------------------------------------------------
# Step 2 — Errors
# ---------------------------------------------------------------------------
printf '[dev-cycle] Step 2/4: checking for errors...\n'
errors_out="$(obsidian dev:errors vault="$VAULT" 2>/dev/null)" || errors_out=""

if [[ -n "$errors_out" ]]; then
  printf '[dev-cycle] ERRORS FOUND — stopping cycle:\n'
  printf '%s\n' "$errors_out"
  printf '\n[dev-cycle] Fix the errors above and re-run dev-cycle.sh\n'
  exit 0
fi
printf '[dev-cycle] Errors: none\n'

# ---------------------------------------------------------------------------
# Step 3 — Console (last 20 lines)
# ---------------------------------------------------------------------------
printf '[dev-cycle] Step 3/4: capturing console output...\n'
console_out="$(obsidian dev:console vault="$VAULT" 2>/dev/null)" || console_out=""

if [[ -n "$console_out" ]]; then
  # Show last 20 lines
  printf '%s\n' "$console_out" | tail -20
else
  printf '[dev-cycle] Console: (no output)\n'
fi

# ---------------------------------------------------------------------------
# Step 4 — Screenshot (only with --screenshot flag)
# ---------------------------------------------------------------------------
if $SCREENSHOT; then
  printf '[dev-cycle] Step 4/4: capturing screenshot...\n'
  screenshot_out="$(obsidian dev:screenshot vault="$VAULT" 2>/dev/null)" || screenshot_out=""
  if [[ -n "$screenshot_out" ]]; then
    printf '[dev-cycle] Screenshot saved: %s\n' "$screenshot_out"
  else
    printf 'WARN: dev-cycle: dev:screenshot returned no output\n' >&2
  fi
else
  printf '[dev-cycle] Step 4/4: screenshot skipped (pass --screenshot to capture)\n'
fi

printf '\n[dev-cycle] Cycle complete for plugin "%s"\n' "$PLUGIN_ID"
