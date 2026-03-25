#!/usr/bin/env bash
# get-tree.sh — Sensory skill: return the complete hierarchical note tree
#
# Usage:
#   get-tree.sh <vault> <project_slug> [--depth <N>]
#   get-tree.sh vault=<name> <project_slug> [--depth <N>]
#
# Returns nested JSON for every note in projects/<project_slug>/, rooted at
# ROOT nodes.  Missing wikilink targets appear as {"missing":"<name>"} nodes;
# cycles appear as {"cycle":"<path>"} nodes.
#
# Output schema:
#   {
#     "folder": "projects/<slug>",
#     "nodeCount": N,
#     "tree": [
#       {
#         "path":"...","title":"...","type":"ROOT","kind":"...","status":"...",
#         "subtree": [
#           {
#             "path":"...","title":"...","type":"BRANCH","kind":"...","status":"...",
#             "subtree": [{"path":"...","title":"...","type":"LEAF","kind":"...","status":"...","subtree":[]}]
#           },
#           {"missing":"UnresolvedChild"},
#           {"cycle":"projects/slug/NOTE.md"}
#         ]
#       }
#     ]
#   }
#
# --depth N   limit recursion depth (default: unlimited / 50 hard cap)
#
# STORY-018 — Implement get-tree.sh sensory skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> [--depth N]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
PROJECT_SLUG="$2"
MAX_DEPTH=50   # hard cap; overridden by --depth

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --depth)
      shift
      if [[ ! "${1:-}" =~ ^[0-9]+$ ]]; then
        printf 'ERROR: get-tree: --depth requires a positive integer\n' >&2
        exit 1
      fi
      MAX_DEPTH="$1"
      ;;
    *) printf 'ERROR: get-tree: unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
  shift
done

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "get-tree: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

# ---------------------------------------------------------------------------
# JSON-encode inputs
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

js_slug="$(json_str "$PROJECT_SLUG")"
js_depth="$MAX_DEPTH"

# ---------------------------------------------------------------------------
# Single-eval tree-building IIFE
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
TREE_JS=$(cat <<'JSEOF'
(function() {
  var slug     = __SLUG__;
  var maxDepth = __DEPTH__;
  var projDir  = 'projects/' + slug;

  // Build basename → TFile map for O(1) lookups
  var allFiles = app.vault.getMarkdownFiles();
  var fileMap  = {};
  allFiles.forEach(function(f) { fileMap[f.basename] = f; });

  // Helper: strip [[ ]] and alias suffix from a wikilink string
  var resolveLink = function(raw) {
    var s = String(raw || '');
    var m = s.match(/\[\[([^\]#|]+)/);
    return m ? m[1].trim() : s.trim();
  };

  var nodeCount = 0;

  // Recursive tree builder; visited is a Set of file paths
  var buildNode = function(f, visited, depth) {
    nodeCount++;
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};

    var node = {
      path:    f.path,
      title:   String(fm.title  || f.basename),
      type:    String(fm.type   || ''),
      kind:    String(fm.kind   || ''),
      status:  String(fm.status || ''),
      subtree: []
    };

    if (depth >= maxDepth) return node;

    var children = [].concat(fm.children || []);
    for (var i = 0; i < children.length; i++) {
      var childName = resolveLink(children[i]);
      if (!childName) continue;

      var childFile = fileMap[childName];
      if (!childFile) {
        node.subtree.push({ missing: childName });
        continue;
      }
      if (visited.has(childFile.path)) {
        node.subtree.push({ cycle: childFile.path });
        continue;
      }
      var childVisited = new Set(visited);
      childVisited.add(childFile.path);
      node.subtree.push(buildNode(childFile, childVisited, depth + 1));
    }

    return node;
  };

  // Find ROOT nodes in the project folder
  var rootFiles = allFiles.filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    return fm.type === 'ROOT';
  });

  var tree = rootFiles.map(function(f) {
    var visited = new Set([f.path]);
    return buildNode(f, visited, 0);
  });

  return JSON.stringify({
    folder:    projDir,
    nodeCount: nodeCount,
    tree:      tree
  });
})()
JSEOF
)

TREE_JS="${TREE_JS/__SLUG__/${js_slug}}"
TREE_JS="${TREE_JS/__DEPTH__/${js_depth}}"

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
result="$(ob_eval "$VAULT" "$TREE_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: get-tree: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

python3 - "$result" <<'PYEOF'
import json, sys
raw = sys.argv[1]
try:
    data = json.loads(raw)
    print(json.dumps(data))
except Exception as e:
    sys.stderr.write('ERROR: get-tree: invalid JSON from eval: {}\n'.format(e))
    sys.exit(1)
PYEOF
