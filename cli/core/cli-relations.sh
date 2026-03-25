#!/usr/bin/env bash
# cli-relations.sh — Reflex skill: enumerate typed connections and validate against ontology
#
# Usage:
#   cli-relations.sh <vault|vault=name> [<folder>] [--json]
#
# For each note in scope, extracts "- <rel> :: [[<target>]]" lines from
# ## Connections and emits:
#   <source> --<rel>--> <target>
#
# Validates each <rel> against _ontology.*.md in scope; emits a warning for
# unknown types without halting. Emits a count-per-type summary at the end.
# Excludes: _vocab*, _topk*, _ontology*, tpl-*
# Exit: 0 in all cases.
#
# STORY-011 — Implement cli-relations.sh reflex skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Arg parsing — strip --json before positional arg resolution
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

# ---------------------------------------------------------------------------
# Helper: JSON-encode a string for safe embedding in JS
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

js_folder="$(json_str "$FOLDER")"

# ---------------------------------------------------------------------------
# Build and run the relations engine in a single obsidian eval call.
# The JS:
#   1. Loads valid relationship types from every _ontology.*.md in scope.
#   2. Scans ## Connections sections of all note files for typed edge lines.
#   3. Returns edges, per-type counts, and unknown types as JSON.
# ---------------------------------------------------------------------------
RELATIONS_JS="(async () => {
  var folder = ${js_folder};

  // Collect all .md files in scope
  var allFiles = app.vault.getFiles().filter(function(f) {
    if (f.extension !== 'md') return false;
    if (folder && !f.path.startsWith(folder + '/') && f.path !== folder) return false;
    return true;
  });

  // Load valid relationship types from _ontology.*.md files in scope.
  // Extracts the first pipe-column of the ## Relationship Types table,
  // stripping backticks and whitespace (mirrors the awk extraction approach).
  var ontologyFiles = allFiles.filter(function(f) {
    return f.name.startsWith('_ontology');
  });
  var validTypes = {};
  for (var oi = 0; oi < ontologyFiles.length; oi++) {
    var oContent = await app.vault.cachedRead(ontologyFiles[oi]);
    var oLines = oContent.split('\n');
    var inTable = false;
    for (var ol = 0; ol < oLines.length; ol++) {
      var oLine = oLines[ol];
      if (/^## Relationship Types/.test(oLine)) { inTable = true; continue; }
      if (inTable && /^## /.test(oLine)) { inTable = false; break; }
      if (inTable && /^\|/.test(oLine)) {
        var col = (oLine.split('|')[1] || '').replace(/[\`\s]/g, '');
        // Skip header row ('Type') and separator rows ('---')
        if (col && col !== 'Type' && !/^-+$/.test(col)) {
          validTypes[col] = true;
        }
      }
    }
  }
  var hasOntology = Object.keys(validTypes).length > 0;

  // Note files to scan — exclude _vocab*, _topk*, _ontology*, tpl-*
  var noteFiles = allFiles.filter(function(f) {
    var n = f.name;
    return !n.startsWith('_vocab') &&
           !n.startsWith('_topk') &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  // Regex for typed connection lines:
  //   - <rel> :: [[<target>]]
  //   - <rel> :: [[<target>]] — <context>   (em dash U+2014)
  var connRe = /^- ([a-z][a-z0-9-]*) :: \[\[([^\]]+)\]\](?:\s*\u2014\s*(.*))?$/;

  var edges = [];
  var relCounts = {};
  var unknownSet = {};

  for (var ni = 0; ni < noteFiles.length; ni++) {
    var nf = noteFiles[ni];
    var content = await app.vault.cachedRead(nf);
    // Strip YAML frontmatter
    var bodyText = content.replace(/^---[\s\S]*?---\n?/, '');

    // Isolate ## Connections section body
    var connSection = '';
    var sections = bodyText.split(/\n(?=## )/);
    for (var si = 0; si < sections.length; si++) {
      if (/^## Connections\b/.test(sections[si])) {
        connSection = sections[si].replace(/^## Connections\n?/, '');
        break;
      }
    }

    var connLines = connSection.split('\n');
    for (var ci = 0; ci < connLines.length; ci++) {
      var m = connLines[ci].trim().match(connRe);
      if (!m) continue;
      var rel     = m[1];
      var target  = m[2];
      var context = m[3] || '';
      edges.push({source: nf.basename, rel: rel, target: target, context: context});
      relCounts[rel] = (relCounts[rel] || 0) + 1;
      if (hasOntology && !validTypes[rel]) {
        unknownSet[rel] = true;
      }
    }
  }

  return JSON.stringify({
    edges:        edges,
    relCounts:    relCounts,
    unknownTypes: Object.keys(unknownSet)
  });
})()"

result="$(ob_eval "$VAULT" "$RELATIONS_JS" 2>/dev/null)" \
  || result='{"edges":[],"relCounts":{},"unknownTypes":[]}'

if [[ -z "$result" ]]; then
  result='{"edges":[],"relCounts":{},"unknownTypes":[]}'
fi

# ---------------------------------------------------------------------------
# Emit output
# ---------------------------------------------------------------------------
if $JSON_OUTPUT; then
  python3 - "$result" <<'PYEOF'
import json, sys
data    = json.loads(sys.argv[1])
summary = dict(sorted(data["relCounts"].items(), key=lambda x: -x[1]))
print(json.dumps({
    "edges":        data["edges"],
    "summary":      summary,
    "unknownTypes": data["unknownTypes"]
}))
PYEOF
else
  python3 - "$result" <<'PYEOF'
import json, sys
data         = json.loads(sys.argv[1])
edges        = data["edges"]
relCounts    = data["relCounts"]
unknownTypes = data["unknownTypes"]

for e in edges:
    print("{} --{}--> {}".format(e["source"], e["rel"], e["target"]))

for rel in unknownTypes:
    print(u"\u26a0 Unknown relationship type: '{}'".format(rel))

if relCounts:
    print("\nSummary:")
    for rel, count in sorted(relCounts.items(), key=lambda x: -x[1]):
        print("  {}: {}".format(rel, count))

print("\nRelations complete. {} edge(s) across {} relationship type(s).".format(
    len(edges), len(relCounts)))
PYEOF
fi
