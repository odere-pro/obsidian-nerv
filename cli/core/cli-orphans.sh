#!/usr/bin/env bash
# cli-orphans.sh — Reflex skill: verify bidirectional parent↔children integrity
#
# Usage:
#   cli-orphans.sh <vault> [<folder>] [--json]
#   cli-orphans.sh vault=<name> [<folder>] [--json]
#
# Detects four failure modes:
#   ORPHAN   — BRANCH/LEAF with no parent field
#   BROKEN   — parent wikilink resolves to no file
#   MISMATCH — parent doesn't list this note as a child
#   CHILD    — parent lists a child that doesn't exist
#
# Excludes: ROOT notes from ORPHAN check (ROOT has no parent by design)
# Excludes: tpl-*, _vocab*, _topk*, _ontology*
#
# Exit codes: 0 success (findings written to stdout); 1 script-level error.
#
# STORY-010 — Implement cli-orphans.sh reflex skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------
JSON_OUTPUT=false
_ARGS=()
for _a in "$@"; do
  [[ "$_a" == "--json" ]] && JSON_OUTPUT=true || _ARGS+=("$_a")
done

if [[ ${#_ARGS[@]} -lt 1 ]]; then
  printf 'Usage: %s <vault|vault=name> [<folder>] [--json]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "${_ARGS[0]}")"
FOLDER="${_ARGS[1]:-}"

json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

js_folder="$(json_str "$FOLDER")"

# shellcheck disable=SC2016
ORPHANS_JS=$(cat <<'JSEOF'
(async () => {
  var folder = __FOLDER__;

  var allFiles = app.vault.getMarkdownFiles().filter(function(f) {
    if (folder && !f.path.startsWith(folder + '/') && f.path !== folder) return false;
    var n = f.name;
    return !n.startsWith('tpl-')      &&
           !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology');
  });

  // Build path → file lookup
  var byPath = {};
  allFiles.forEach(function(f) { byPath[f.path] = f; });

  // Resolve a wikilink string to a TFile or null
  function resolveLink(linktext, sourcePath) {
    return app.metadataCache.getFirstLinkpathDest(linktext, sourcePath) || null;
  }

  var issues = [];

  allFiles.forEach(function(f) {
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var type  = fm.type ? String(fm.type) : '';

    // ORPHAN: BRANCH/LEAF must have a parent
    if ((type === 'BRANCH' || type === 'LEAF') &&
        (!fm.parent || String(fm.parent).trim() === '')) {
      issues.push({ type: 'ORPHAN', note: f.path,
        detail: type + ' has no parent' });
    }

    // BROKEN parent reference
    if ((type === 'BRANCH' || type === 'LEAF') &&
         fm.parent && String(fm.parent).trim() !== '') {
      var rawParent = String(fm.parent).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
      var parentFile = resolveLink(rawParent, f.path);
      if (!parentFile) {
        issues.push({ type: 'BROKEN', note: f.path,
          detail: 'parent "' + rawParent + '" not found' });
      } else {
        // MISMATCH: parent exists but doesn't list this note as a child
        var pCache = app.metadataCache.getFileCache(parentFile);
        var pFm    = (pCache && pCache.frontmatter) ? pCache.frontmatter : {};
        var children = Array.isArray(pFm.children) ? pFm.children : [];
        var listed = children.some(function(c) {
          var cRaw = String(c).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
          var cFile = resolveLink(cRaw, parentFile.path);
          return cFile && cFile.path === f.path;
        });
        if (!listed) {
          issues.push({ type: 'MISMATCH', note: f.path,
            detail: 'parent "' + rawParent + '" does not list this note as a child' });
        }
      }
    }

    // CHILD: iterate children and check they all exist
    if (type === 'ROOT' || type === 'BRANCH') {
      var children = Array.isArray(fm.children) ? fm.children : [];
      children.forEach(function(c) {
        var cRaw  = String(c).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
        var cFile = resolveLink(cRaw, f.path);
        if (!cFile) {
          issues.push({ type: 'CHILD', note: f.path,
            detail: '"' + f.basename + '" lists child "' + cRaw + '" — not found' });
        }
      });
    }
  });

  return JSON.stringify({ noteCount: allFiles.length, issues: issues });
})()
JSEOF
)
ORPHANS_JS="${ORPHANS_JS/__FOLDER__/${js_folder}}"

result="$(ob_eval "$VAULT" "$ORPHANS_JS" 2>/dev/null)" || result='{"noteCount":0,"issues":[]}'
[[ -z "$result" ]] && result='{"noteCount":0,"issues":[]}'

if $JSON_OUTPUT; then
  python3 - "$result" <<'PYEOF'
import json, sys
data   = json.loads(sys.argv[1])
issues = data.get('issues', [])
print(json.dumps({"issues": issues, "count": len(issues)}))
PYEOF
else
  python3 - "$result" <<'PYEOF'
import json, sys
data   = json.loads(sys.argv[1])
issues = data.get('issues', [])
n      = data.get('noteCount', 0)
for iss in issues:
    label = {'ORPHAN': '\u2717 ORPHAN', 'BROKEN': '\u2717 BROKEN',
             'MISMATCH': '\u2717 MISMATCH', 'CHILD': '\u2717 BROKEN'}.get(iss['type'], iss['type'])
    print('{}: {} — {}'.format(label, iss['note'], iss['detail']))
print('Link check complete. {} issue(s) in {} note(s).'.format(len(issues), n))
PYEOF
fi
