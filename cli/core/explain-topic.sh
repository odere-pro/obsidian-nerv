#!/usr/bin/env bash
# explain-topic.sh — Sensory skill: assemble a teaching bundle for a queried topic
#
# Usage:
#   explain-topic.sh <vault|vault=name> "<query>"
#
# Locates the highest-scoring matching note via context.sh, then assembles:
#   primary   — full entity detail from get-entity.sh
#   parent    — parent note title + summary (null when primary is ROOT)
#   siblings  — all notes sharing the same parent; summaries truncated to 500 chars
#   connected — notes reachable via typed connections; title, summary, kind, rel
#
# Output schema:
#   {
#     "primary":   {<get-entity output>},
#     "parent":    {"title":"...","summary":"..."} | null,
#     "siblings":  [{"title":"...","summary":"..."}],
#     "connected": [{"title":"...","summary":"...","kind":"...","rel":"..."}]
#   }
#
# Exits 1 when: no matching note found, Obsidian unreachable, or sub-skills fail.
#
# STORY-019 — Implement get-knowledge-gap.sh and explain-topic.sh sensory skills
# Requires: context.sh, get-entity.sh, lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> "<query>"\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
QUERY="$2"

json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

# ---------------------------------------------------------------------------
# Step 1 — Locate primary note via context.sh (highest-scoring match).
#           context.sh is called as a subprocess per the design contract.
# ---------------------------------------------------------------------------
ctx_out="$(bash "$SCRIPT_DIR/context.sh" "$VAULT" "$QUERY" 1 2>/dev/null)" || ctx_out=''

if [[ -z "$ctx_out" ]]; then
  printf 'ERROR: explain-topic: context.sh failed or Obsidian unreachable\n' >&2
  exit 1
fi

primary_path="$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
r = d.get('results', [])
print(r[0]['path'] if r else '')
" "$ctx_out" 2>/dev/null || true)"

if [[ -z "$primary_path" ]]; then
  printf 'ERROR: explain-topic: no matching note found for query: %s\n' "$QUERY" >&2
  exit 1
fi

# Extract the basename (without .md) to pass to get-entity.sh
primary_basename="$(python3 -c "
import os, json, sys
d = json.loads(sys.argv[1])
r = d.get('results', [])
p = r[0]['path'] if r else ''
print(os.path.splitext(os.path.basename(p))[0])
" "$ctx_out" 2>/dev/null || true)"

# ---------------------------------------------------------------------------
# Step 2 — Full entity detail via get-entity.sh.
#           get-entity.sh is called as a subprocess per the design contract.
# ---------------------------------------------------------------------------
entity_out="$(bash "$SCRIPT_DIR/get-entity.sh" "$VAULT" "$primary_basename" 2>/dev/null)" || entity_out=''

if [[ -z "$entity_out" ]]; then
  printf 'ERROR: explain-topic: get-entity.sh failed for note: %s\n' "$primary_basename" >&2
  exit 1
fi

# Extract parent field value and connections from entity output
parent_val="$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
print(d.get('frontmatter', {}).get('parent', ''))
" "$entity_out" 2>/dev/null || true)"

# Connections from context.sh result (rel/target/context triples)
connections_json="$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
r = d.get('results', [])
conns = r[0].get('connections', []) if r else []
print(json.dumps(conns))
" "$ctx_out" 2>/dev/null || echo '[]')"

js_primary_path="$(json_str "$primary_path")"
js_parent_val="$(json_str "$parent_val")"

# ---------------------------------------------------------------------------
# Step 3 — Assemble parent / siblings / connected via a single ob_eval call.
#           Summaries are truncated to 500 chars per the design recommendation.
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
EXPLAIN_JS=$(cat <<'JSEOF'
(async () => {
  var primaryPath  = __PRIMARY_PATH__;
  var parentVal    = __PARENT_VAL__;
  var connections  = __CONNECTIONS__;

  // Resolve a raw [[WikiLink]] or plain name to a basename
  var resolveLink = function(raw) {
    var s = String(raw || '');
    var m = s.match(/\[\[([^\]#|]+)/);
    return m ? m[1].trim() : s.trim();
  };

  // Read ## Summary section from a file, truncated to 500 chars
  var getSummary = async function(f) {
    var body = await app.vault.cachedRead(f);
    var bt   = body.replace(/^---[\s\S]*?---\n?/, '');
    var m    = bt.match(/^## Summary\s*\n([\s\S]*?)(?=\n## |$)/m);
    return m ? m[1].trim().substring(0, 500) : '';
  };

  var allFiles   = app.vault.getMarkdownFiles();
  var parentName = resolveLink(parentVal);

  // --- Parent ---
  var parentResult = null;
  if (parentName) {
    var parentFile = allFiles.find(function(f){ return f.basename === parentName; });
    if (parentFile) {
      var pc  = app.metadataCache.getFileCache(parentFile);
      var pfm = (pc && pc.frontmatter) ? pc.frontmatter : {};
      parentResult = {
        title:   String(pfm.title || parentFile.basename),
        summary: await getSummary(parentFile)
      };
    }
  }

  // --- Siblings: notes sharing the same parent (excluding primary) ---
  var siblings = [];
  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    if (f.path === primaryPath) continue;
    var sc  = app.metadataCache.getFileCache(f);
    var sfm = (sc && sc.frontmatter) ? sc.frontmatter : {};
    var fParent = resolveLink(sfm.parent || '');
    if (parentName && fParent === parentName) {
      var sfmTitle = String(sfm.title || f.basename);
      siblings.push({ title: sfmTitle, summary: await getSummary(f) });
    }
  }

  // --- Connected: resolve each typed connection target ---
  var connected = [];
  for (var c = 0; c < connections.length; c++) {
    var conn   = connections[c];
    var target = conn.target || '';
    var dest   = app.metadataCache.getFirstLinkpathDest(target, primaryPath);
    if (!dest) continue;
    var dc  = app.metadataCache.getFileCache(dest);
    var dfm = (dc && dc.frontmatter) ? dc.frontmatter : {};
    connected.push({
      title:   String(dfm.title || dest.basename),
      summary: await getSummary(dest),
      kind:    String(dfm.kind || ''),
      rel:     conn.rel || ''
    });
  }

  return JSON.stringify({
    parent:    parentResult,
    siblings:  siblings,
    connected: connected
  });
})()
JSEOF
)

EXPLAIN_JS="${EXPLAIN_JS/__PRIMARY_PATH__/${js_primary_path}}"
EXPLAIN_JS="${EXPLAIN_JS/__PARENT_VAL__/${js_parent_val}}"
EXPLAIN_JS="${EXPLAIN_JS/__CONNECTIONS__/${connections_json}}"

surrounding="$(ob_eval "$VAULT" "$EXPLAIN_JS" 2>/dev/null)" || surrounding=''

if [[ -z "$surrounding" ]]; then
  printf 'ERROR: explain-topic: context assembly eval failed\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4 — Assemble final output JSON
# ---------------------------------------------------------------------------
python3 - "$entity_out" "$surrounding" <<'PYEOF'
import json, sys
try:
    primary    = json.loads(sys.argv[1])
    surround   = json.loads(sys.argv[2])
except Exception as e:
    sys.stderr.write('ERROR: explain-topic: invalid JSON: {}\n'.format(e))
    sys.exit(1)

print(json.dumps({
    "primary":   primary,
    "parent":    surround.get("parent"),
    "siblings":  surround.get("siblings",  []),
    "connected": surround.get("connected", [])
}))
PYEOF
