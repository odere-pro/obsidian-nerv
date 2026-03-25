#!/usr/bin/env bash
# dependency-map.sh — Dev skill: filter relationship graph to depends-on edges
#
# Usage:
#   dependency-map.sh <vault> <project_slug> [--format json|dot]
#   dependency-map.sh vault=<name> <project_slug> [--format json|dot]
#
# Output (JSON, default):
#   {"project":"<slug>","edges":[{"source":"...","target":"...","context":"..."}]}
#
# Output (DOT, --format dot):
#   digraph <slug> { "source" -> "target" [label="depends-on"]; ... }
#
# STORY-023 — Implement dev-specific skills
# Requires: lib.sh, cli-relations.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../core" && pwd)"
source "$CORE_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> [--format json|dot]\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
PROJECT_SLUG="$2"
FORMAT="json"

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      shift
      case "${1:-}" in
        json|dot) FORMAT="$1" ;;
        *) printf 'ERROR: dependency-map: unknown format: %s (json|dot)\n' "${1:-}" >&2; exit 1 ;;
      esac
      ;;
    *) printf 'ERROR: dependency-map: unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "dependency-map: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

CLI_RELATIONS="$CORE_DIR/cli-relations.sh"
if [[ ! -x "$CLI_RELATIONS" ]]; then
  log_error "dependency-map: cli-relations.sh not found at $CLI_RELATIONS"
fi

# ---------------------------------------------------------------------------
# Run cli-relations.sh --json and filter to depends-on edges
# ---------------------------------------------------------------------------
relations_json="$(bash "$CLI_RELATIONS" "vault=$VAULT" "$PROJECT_SLUG" --json 2>/dev/null)" \
  || relations_json=''

if [[ -z "$relations_json" ]]; then
  printf 'ERROR: dependency-map: cli-relations.sh failed or Obsidian not reachable\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Filter and emit
# ---------------------------------------------------------------------------
if [[ "$FORMAT" == "json" ]]; then
  python3 - "$PROJECT_SLUG" "$relations_json" <<'PYEOF'
import json, sys
slug  = sys.argv[1]
data  = json.loads(sys.argv[2])
edges = [
  {"source": e["source"], "target": e["target"], "context": e.get("context", "")}
  for e in data.get("edges", [])
  if e.get("rel") == "depends-on"
]
print(json.dumps({"project": slug, "edges": edges}))
PYEOF

elif [[ "$FORMAT" == "dot" ]]; then
  python3 - "$PROJECT_SLUG" "$relations_json" <<'PYEOF'
import json, sys
slug  = sys.argv[1]
data  = json.loads(sys.argv[2])
edges = [e for e in data.get("edges", []) if e.get("rel") == "depends-on"]
lines = ['digraph {} {{'.format(slug)]
for e in edges:
    ctx = e.get("context", "")
    lbl = ' [label="{}"]'.format(ctx) if ctx else ''
    lines.append('  "{}" -> "{}"{};'.format(e["source"], e["target"], lbl))
lines.append('}')
print('\n'.join(lines))
PYEOF
fi
