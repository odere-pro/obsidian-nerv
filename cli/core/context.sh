#!/usr/bin/env bash
# context.sh — Primary sensory skill: relevance-scored vault retrieval
#
# Usage:
#   context.sh <vault> "<query>" [<limit>]
#   context.sh vault=<name> "<query>" [<limit>]
#
# Scores every markdown note against <query> using a weighted multi-factor
# model, returns top <limit> results (default 5) as JSON.
#
# Scoring weights (per term):
#   title match        +10
#   alias match        +8
#   kind match         +5
#   spine match        +4
#   tag match          +3
#   body term freq     +1 per occurrence, capped at +5
#
# Output schema:
#   {
#     "query": "...", "vault": "...",
#     "results": [{
#       "path": "...", "title": "...", "type": "...", "kind": "...",
#       "spine": "...", "status": "...", "parent": "...",
#       "children": [...], "aliases": [...],
#       "breadcrumb": "ROOT > Branch > Leaf",
#       "summary": "<## Summary content>",
#       "content": "<## Content, truncated to 2000 chars>",
#       "connections": [{"rel":"...","target":"...","context":"..."}]
#     }]
#   }
#
# Returns {"results":[]} with exit 0 when no notes match.
# Runtime target: < 5 s for a 200-note vault.
#
# STORY-016 — Implement context.sh primary sensory skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> "<query>" [<limit>]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
QUERY="$2"
LIMIT="${3:-5}"

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
  printf 'ERROR: context: limit must be a positive integer (got: %s)\n' "$LIMIT" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# JSON-encode inputs to safely embed in the JS expression
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

js_query="$(json_str "$QUERY")"
js_limit="$LIMIT"   # integer — no encoding needed

# ---------------------------------------------------------------------------
# Scoring + retrieval IIFE — single eval for performance.
# Single-quoted heredoc; __QUERY__ and __LIMIT__ substituted after.
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
CONTEXT_JS=$(cat <<'JSEOF'
(async () => {
  var query = __QUERY__;
  var limit = __LIMIT__;

  // Normalize query: lowercase, strip punctuation, split into terms
  var terms = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(function(t){ return t.length > 0; });

  // Pre-build basename → file map for O(1) parent lookups
  var allFiles = app.vault.getMarkdownFiles();
  var fileMap = {};
  allFiles.forEach(function(f){ fileMap[f.basename] = f; });

  // Helper: escape a string for use in RegExp
  var escapeRe = function(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  var scored = [];

  for (var i = 0; i < allFiles.length; i++) {
    var f      = allFiles[i];
    var cache  = app.metadataCache.getFileCache(f);
    var fm     = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var body   = await app.vault.cachedRead(f);
    var bodyLow = body.toLowerCase();

    var title   = String(fm.title || f.basename).toLowerCase();
    var kind    = String(fm.kind  || '').toLowerCase();
    var spine   = String(fm.spine || '').toLowerCase();
    var tags    = [].concat(fm.tags || fm.tag || []).map(function(t){ return String(t).toLowerCase(); });
    var aliases = [].concat(fm.aliases || fm.alias || []).map(function(a){ return String(a).toLowerCase(); });

    var score = 0;
    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      var re   = escapeRe(term);

      // Title
      if (title.indexOf(term) !== -1) score += 10;

      // Aliases
      for (var a = 0; a < aliases.length; a++) {
        if (aliases[a].indexOf(term) !== -1) { score += 8; break; }
      }

      // Kind
      if (kind.indexOf(term) !== -1) score += 5;

      // Spine
      if (spine.indexOf(term) !== -1) score += 4;

      // Tags
      for (var tg = 0; tg < tags.length; tg++) {
        if (tags[tg].indexOf(term) !== -1) { score += 3; break; }
      }

      // Body term frequency (cap at 5)
      var freq = (bodyLow.match(new RegExp(re, 'g')) || []).length;
      score += Math.min(freq, 5);
    }

    if (score > 0) {
      scored.push({ f: f, fm: fm, body: body, score: score });
    }
  }

  // Sort descending; take top N
  scored.sort(function(a, b){ return b.score - a.score; });
  scored = scored.slice(0, limit);

  // -------------------------------------------------------------------------
  // Build result objects
  // -------------------------------------------------------------------------
  var results = [];

  for (var j = 0; j < scored.length; j++) {
    var item = scored[j];
    var rf   = item.f;
    var rfm  = item.fm;
    var rbody = item.body;

    // --- Summary section ---
    var summaryMatch = rbody.match(/^## Summary\s*\n([\s\S]*?)(?=\n## |\n---\s*\n|$)/m);
    var summary = summaryMatch ? summaryMatch[1].trim() : '';

    // --- Content section (2000-char cap) ---
    var contentMatch = rbody.match(/^## Content\s*\n([\s\S]*?)(?=\n## |\n---\s*\n|$)/m);
    var content = contentMatch ? contentMatch[1].trim().substring(0, 2000) : '';

    // --- Connections section ---
    var connections = [];
    var connMatch = rbody.match(/^## Connections\s*\n([\s\S]*?)(?=\n## |\n---\s*\n|$)/m);
    if (connMatch) {
      var connLines = connMatch[1].split('\n');
      for (var cl = 0; cl < connLines.length; cl++) {
        var m = connLines[cl].match(/^- ([a-z][\w-]*) :: \[\[([^\]]+)\]\](.*)?$/);
        if (m) {
          connections.push({
            rel:     m[1],
            target:  m[2],
            context: (m[3] || '').trim()
          });
        }
      }
    }

    // --- Breadcrumb: traverse parent chain up to 5 hops ---
    var crumbs  = [rf.basename];
    var seen    = {};
    seen[rf.path] = true;
    var cur     = rfm;
    var cycled  = false;

    for (var hop = 0; hop < 5; hop++) {
      var parentVal = cur.parent || '';
      if (!parentVal) break;
      // Strip [[ ]] if present
      var pm = String(parentVal).match(/\[\[([^\]#|]+)/);
      var parentName = pm ? pm[1].trim() : String(parentVal).trim();
      if (!parentName) break;

      var parentFile = fileMap[parentName];
      if (!parentFile) { crumbs.unshift(parentName); break; }
      if (seen[parentFile.path]) { cycled = true; break; }
      seen[parentFile.path] = true;

      crumbs.unshift(parentFile.basename);

      var pc  = app.metadataCache.getFileCache(parentFile);
      cur = (pc && pc.frontmatter) ? pc.frontmatter : {};
      if (cur.type === 'ROOT') break;
    }
    if (cycled) crumbs.push('[cycle detected]');

    results.push({
      path:        rf.path,
      title:       String(rfm.title  || rf.basename),
      type:        String(rfm.type   || ''),
      kind:        String(rfm.kind   || ''),
      spine:       String(rfm.spine  || ''),
      status:      String(rfm.status || ''),
      parent:      String(rfm.parent || ''),
      children:    [].concat(rfm.children || []).map(String),
      aliases:     [].concat(rfm.aliases || rfm.alias || []).map(String),
      breadcrumb:  crumbs.join(' > '),
      summary:     summary,
      content:     content,
      connections: connections
    });
  }

  return JSON.stringify({
    query:   query,
    vault:   app.vault.getName(),
    results: results
  });
})()
JSEOF
)

CONTEXT_JS="${CONTEXT_JS/__QUERY__/${js_query}}"
CONTEXT_JS="${CONTEXT_JS/__LIMIT__/${js_limit}}"

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
result="$(ob_eval "$VAULT" "$CONTEXT_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: context: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

# Validate JSON and handle empty-results fallback
python3 - "$result" <<'PYEOF'
import json, sys
raw = sys.argv[1]
try:
    data = json.loads(raw)
    # Ensure required keys exist
    if 'results' not in data:
        data = {"query": data.get("query",""), "vault": data.get("vault",""), "results": []}
    print(json.dumps(data))
except Exception as e:
    sys.stderr.write('ERROR: context: invalid JSON from eval: {}\n'.format(e))
    print('{"results":[]}')
    sys.exit(1)
PYEOF
