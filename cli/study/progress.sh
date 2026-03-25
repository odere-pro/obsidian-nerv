#!/usr/bin/env bash
# progress.sh — Study skill: study progress dashboard for a project
#
# Usage:
#   progress.sh <vault|vault=name> <project_slug> [--format compact]
#
# Returns a progress snapshot: note counts by status, completion percentage
# (stable / total * 100), knowledge metrics (word count, edge count), and
# basenames of notes modified in the last 7 days.
#
# Output schema (default JSON):
#   {
#     "project":    "aws",
#     "notes":      {"total":N,"stable":N,"review":N,"draft":N},
#     "completion": X.X,
#     "knowledge":  {"totalWords":N,"totalEdges":N,"avgEdgesPerNote":X.X},
#     "thisWeek":   ["<basename>",...]
#   }
#
# Output (--format compact):
#   aws: 42 notes, 73% stable, 156 edges
#
# Excludes: _vocab*, _topk*, _ontology*, tpl-*
# Exit codes: 0 success; 1 error.
#
# STORY-022 — Implement study-specific skills and Quizmaster integration
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../core/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
FORMAT="json"
_ARGS=()
for _a in "$@"; do
  if [[ "$_a" == "--format" ]]; then
    :  # handled by next iteration
  elif [[ "$_a" == "compact" && ${#_ARGS[@]} -eq 2 ]]; then
    FORMAT="compact"
  else
    _ARGS+=("$_a")
  fi
done

# Re-parse: --format compact is a two-token flag; handle via positional scan
FORMAT="json"
_POSARGS=()
i=0
ARGV=("$@")
while [[ $i -lt ${#ARGV[@]} ]]; do
  case "${ARGV[$i]}" in
    --format)
      i=$((i + 1))
      FORMAT="${ARGV[$i]:-json}"
      ;;
    *)
      _POSARGS+=("${ARGV[$i]}")
      ;;
  esac
  i=$((i + 1))
done

if [[ ${#_POSARGS[@]} -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> [--format compact]\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "${_POSARGS[0]}")"
PROJECT_SLUG="${_POSARGS[1]}"

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf 'ERROR: progress: project slug must be lowercase alphanumeric with hyphens\n' >&2
  exit 1
fi

json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

js_slug="$(json_str "$PROJECT_SLUG")"

# ---------------------------------------------------------------------------
# Single-eval IIFE — aggregate status counts, word counts, edges, thisWeek.
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
PROG_JS=$(cat <<'JSEOF'
(async () => {
  var slug       = __SLUG__;
  var projDir    = 'projects/' + slug;
  var oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  var total = 0, stable = 0, review = 0, draft = 0;
  var totalWords = 0, totalEdges = 0;
  var thisWeek   = [];

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var body  = await app.vault.cachedRead(f);
    var bt    = body.replace(/^---[\s\S]*?---\n?/, '');

    total++;

    var status = String(fm.status || 'draft');
    if (status === 'stable')      stable++;
    else if (status === 'review') review++;
    else                          draft++;

    // Word count (body only, frontmatter stripped)
    totalWords += bt.trim().split(/\s+/).filter(Boolean).length;

    // Typed edges — lines matching "- <rel> :: [["
    totalEdges += (body.match(/^- [a-z][a-z0-9-]* :: \[\[/gm) || []).length;

    // Modified in the last 7 days
    if (f.stat && f.stat.mtime > oneWeekAgo) {
      thisWeek.push(f.basename);
    }
  }

  var completion  = total > 0
    ? Math.round((stable / total * 100) * 10) / 10 : 0;
  var avgEdges    = total > 0
    ? Math.round((totalEdges / total) * 10) / 10 : 0;

  return JSON.stringify({
    project:    slug,
    notes:      { total: total, stable: stable, review: review, draft: draft },
    completion: completion,
    knowledge:  { totalWords: totalWords, totalEdges: totalEdges,
                  avgEdgesPerNote: avgEdges },
    thisWeek:   thisWeek
  });
})()
JSEOF
)

PROG_JS="${PROG_JS/__SLUG__/${js_slug}}"

result="$(ob_eval "$VAULT" "$PROG_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: progress: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
python3 - "$result" "$PROJECT_SLUG" "$FORMAT" <<'PYEOF'
import json, sys
try:
    data = json.loads(sys.argv[1])
except Exception as e:
    sys.stderr.write('ERROR: progress: invalid JSON from eval: {}\n'.format(e))
    sys.exit(1)

slug   = sys.argv[2]
fmt    = sys.argv[3]

if fmt == 'compact':
    n       = data.get('notes', {})
    total   = n.get('total', 0)
    stable  = n.get('stable', 0)
    edges   = data.get('knowledge', {}).get('totalEdges', 0)
    pct     = data.get('completion', 0.0)
    print('{}: {} notes, {}% stable, {} edges'.format(slug, total, pct, edges))
else:
    print(json.dumps(data))
PYEOF
