#!/usr/bin/env bash
# coverage.sh — Study skill: report spine-domain coverage for a project
#
# Usage:
#   coverage.sh <vault|vault=name> <project_slug>
#
# Groups all notes in projects/<project_slug>/ by their `spine` frontmatter
# field and reports note counts per status (stable / review / draft) and a
# coverage percentage (stable / total * 100, rounded to 1 decimal place).
# Also returns an overall summary across all spines.
#
# Output schema:
#   {
#     "project": "aws",
#     "domains": [
#       {"spine":"...","total":N,"stable":N,"review":N,"draft":N,"coverage":X.X}
#     ],
#     "overall": {"totalNotes":N,"avgCoverage":X.X}
#   }
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
if [[ $# -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug>\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
PROJECT_SLUG="$2"

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  printf 'ERROR: coverage: project slug must be lowercase alphanumeric with hyphens\n' >&2
  exit 1
fi

json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

js_slug="$(json_str "$PROJECT_SLUG")"

# ---------------------------------------------------------------------------
# Single-eval IIFE — group notes by spine, count by status, compute coverage.
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
COV_JS=$(cat <<'JSEOF'
(function() {
  var slug    = __SLUG__;
  var projDir = 'projects/' + slug;

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  var domains = {};

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var spine  = String(fm.spine  || '__unspined__');
    var status = String(fm.status || 'draft');

    if (!domains[spine]) {
      domains[spine] = { spine: spine, total: 0, stable: 0, review: 0, draft: 0 };
    }
    domains[spine].total++;
    if (status === 'stable')      domains[spine].stable++;
    else if (status === 'review') domains[spine].review++;
    else                          domains[spine].draft++;
  }

  var domainList = Object.keys(domains).sort().map(function(k) {
    var d   = domains[k];
    var cov = d.total > 0
      ? Math.round((d.stable / d.total * 100) * 10) / 10
      : 0;
    return { spine: d.spine, total: d.total, stable: d.stable,
             review: d.review, draft: d.draft, coverage: cov };
  });

  var totalNotes  = notes.length;
  var totalStable = domainList.reduce(function(s, d) { return s + d.stable; }, 0);
  var avgCoverage = totalNotes > 0
    ? Math.round((totalStable / totalNotes * 100) * 10) / 10
    : 0;

  return JSON.stringify({
    project: slug,
    domains: domainList,
    overall: { totalNotes: totalNotes, avgCoverage: avgCoverage }
  });
})()
JSEOF
)

COV_JS="${COV_JS/__SLUG__/${js_slug}}"

result="$(ob_eval "$VAULT" "$COV_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: coverage: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

python3 - "$result" <<'PYEOF'
import json, sys
try:
    print(json.dumps(json.loads(sys.argv[1])))
except Exception as e:
    sys.stderr.write('ERROR: coverage: invalid JSON from eval: {}\n'.format(e))
    sys.exit(1)
PYEOF
