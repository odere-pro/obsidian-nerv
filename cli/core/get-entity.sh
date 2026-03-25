#!/usr/bin/env bash
# get-entity.sh — Sensory skill: deep single-note retrieval
#
# Usage:
#   get-entity.sh <vault> "<search-term>"
#   get-entity.sh vault=<name> "<search-term>"
#
# Finds the note matching <search-term> (exact or partial, by basename or alias)
# and returns full entity detail as structured JSON.
#
# Output schema:
#   {
#     "path": "...",
#     "matchType": "exact" | "partial",
#     "frontmatter": { ...all FM fields... },
#     "sections": {
#       "Summary": "...",
#       "Content": "...",
#       "Connections": "...",
#       ...
#     },
#     "backlinks": [{"path":"...","title":"...","type":"...","kind":"...","spine":"..."}],
#     "outgoing": [{"path":"...","title":"...","display":"..."}]
#   }
#
# Exits 1 with stderr message on: no match, ambiguous match, or Obsidian unreachable.
# Sections content is trimmed and truncated to 3000 characters each.
#
# STORY-017 — Implement get-entity.sh sensory skill
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> "<search-term>"\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
SEARCH_TERM="$2"

# ---------------------------------------------------------------------------
# JSON-encode inputs to safely embed in the JS expression
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

js_term="$(json_str "$SEARCH_TERM")"

# ---------------------------------------------------------------------------
# Entity retrieval IIFE — single eval for performance.
# Single-quoted heredoc; __TERM__ substituted after.
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
GET_ENTITY_JS=$(cat <<'JSEOF'
(async () => {
  var searchTerm = __TERM__;

  // Normalize: lowercase, strip "PREFIX.slug - " or "PREFIX." prefix convention
  var normalize = function(s) {
    return s.toLowerCase()
      .replace(/^[a-z0-9_-]+\.[a-z0-9_-]+ - /i, '')
      .replace(/^[a-z0-9_-]+\./i, '')
      .trim();
  };

  var termNorm = normalize(searchTerm);
  var termLow  = searchTerm.toLowerCase();

  var allFiles = app.vault.getMarkdownFiles();

  // --- Match resolution ---
  var exactMatches   = [];
  var partialMatches = [];

  for (var i = 0; i < allFiles.length; i++) {
    var f     = allFiles[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};

    var baseNorm = normalize(f.basename);
    var baseLow  = f.basename.toLowerCase();
    var aliases  = [].concat(fm.aliases || fm.alias || []).map(function(a){ return String(a).toLowerCase(); });

    // Exact: basename equals search term (case-insensitive), or normalized basename matches
    if (baseLow === termLow || baseNorm === termNorm || baseNorm === termLow || baseLow === termNorm) {
      exactMatches.push({ f: f, fm: fm });
      continue;
    }
    // Exact alias match
    var aliasExact = aliases.some(function(a) { return a === termLow; });
    if (aliasExact) {
      exactMatches.push({ f: f, fm: fm });
      continue;
    }

    // Partial: basename or normalized basename contains term
    if (baseLow.indexOf(termLow) !== -1 || baseNorm.indexOf(termNorm) !== -1) {
      partialMatches.push({ f: f, fm: fm });
      continue;
    }
    // Partial alias match
    var aliasPartial = aliases.some(function(a) { return a.indexOf(termLow) !== -1; });
    if (aliasPartial) {
      partialMatches.push({ f: f, fm: fm });
    }
  }

  var matches   = exactMatches.length > 0 ? exactMatches : partialMatches;
  var matchType = exactMatches.length > 0 ? 'exact' : 'partial';

  if (matches.length === 0) {
    return JSON.stringify({ error: 'no_match', term: searchTerm });
  }
  if (matches.length > 1) {
    var paths = matches.map(function(m){ return m.f.path; });
    return JSON.stringify({ error: 'ambiguous', term: searchTerm, matches: paths });
  }

  var match = matches[0];
  var rf    = match.f;
  var rfm   = match.fm;

  // --- Read body ---
  var body = await app.vault.cachedRead(rf);

  // Strip YAML frontmatter block
  var bodyNoFm = body.replace(/^---[\s\S]*?---\s*\n/, '');

  // --- Parse sections by ## heading boundaries; trim + truncate to 3000 chars ---
  var sections = {};
  var parts = bodyNoFm.split(/\n(?=## )/);
  for (var pi = 0; pi < parts.length; pi++) {
    var part = parts[pi];
    var headingMatch = part.match(/^## (.+)\n?([\s\S]*)/);
    if (headingMatch) {
      var sectionName    = headingMatch[1].trim();
      var sectionContent = (headingMatch[2] || '').trim().substring(0, 3000);
      sections[sectionName] = sectionContent;
    }
  }

  // --- Backlinks from metadataCache (not grep) ---
  var backlinks = [];
  var blResult  = app.metadataCache.getBacklinksForFile(rf);
  if (blResult && blResult.data) {
    var blMap   = blResult.data;
    var blPaths = Object.keys(blMap);
    for (var bi = 0; bi < blPaths.length; bi++) {
      var blPath  = blPaths[bi];
      var blFile  = app.vault.getAbstractFileByPath(blPath);
      var blTitle = blPath;
      var blType  = '';
      var blKind  = '';
      var blSpine = '';
      if (blFile) {
        var blCache = app.metadataCache.getFileCache(blFile);
        var blFm    = (blCache && blCache.frontmatter) ? blCache.frontmatter : {};
        blTitle = String(blFm.title  || blFile.basename);
        blType  = String(blFm.type   || '');
        blKind  = String(blFm.kind   || '');
        blSpine = String(blFm.spine  || '');
      }
      backlinks.push({ path: blPath, title: blTitle, type: blType, kind: blKind, spine: blSpine });
    }
  }

  // --- Outgoing links resolved via getFirstLinkpathDest ---
  var outgoing  = [];
  var fCache    = app.metadataCache.getFileCache(rf);
  var linkItems = (fCache && fCache.links) ? fCache.links : [];
  for (var li = 0; li < linkItems.length; li++) {
    var linkItem  = linkItems[li];
    var linkText  = linkItem.link || '';
    var display   = linkItem.displayText || linkText;
    var destFile  = app.metadataCache.getFirstLinkpathDest(linkText, rf.path);
    var destPath  = destFile ? destFile.path : '';
    var destTitle = '';
    if (destFile) {
      var destCache = app.metadataCache.getFileCache(destFile);
      var destFm    = (destCache && destCache.frontmatter) ? destCache.frontmatter : {};
      destTitle = String(destFm.title || destFile.basename);
    } else {
      destTitle = linkText;
    }
    outgoing.push({ path: destPath, title: destTitle, display: display });
  }

  // --- Frontmatter: all fields except internal Obsidian position key ---
  var fmOut = {};
  if (rfm) {
    var fmKeys = Object.keys(rfm);
    for (var ki = 0; ki < fmKeys.length; ki++) {
      var k = fmKeys[ki];
      if (k === 'position') continue;
      fmOut[k] = rfm[k];
    }
  }

  return JSON.stringify({
    path:        rf.path,
    matchType:   matchType,
    frontmatter: fmOut,
    sections:    sections,
    backlinks:   backlinks,
    outgoing:    outgoing
  });
})()
JSEOF
)

GET_ENTITY_JS="${GET_ENTITY_JS/__TERM__/${js_term}}"

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
result="$(ob_eval "$VAULT" "$GET_ENTITY_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: get-entity: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

# Validate and handle error responses from JS
python3 - "$result" "$SEARCH_TERM" <<'PYEOF'
import json, sys
raw  = sys.argv[1]
term = sys.argv[2]
try:
    data = json.loads(raw)
except Exception as e:
    sys.stderr.write('ERROR: get-entity: invalid JSON from eval: {}\n'.format(e))
    sys.exit(1)

if 'error' in data:
    err = data['error']
    if err == 'no_match':
        sys.stderr.write('ERROR: get-entity: no note matches "{}"\n'.format(term))
        sys.exit(1)
    elif err == 'ambiguous':
        matches = '\n  '.join(data.get('matches', []))
        sys.stderr.write(
            'ERROR: get-entity: ambiguous match for "{}" — {} notes found:\n  {}\n'.format(
                term, len(data.get('matches', [])), matches
            )
        )
        sys.exit(1)
    else:
        sys.stderr.write('ERROR: get-entity: {}\n'.format(err))
        sys.exit(1)

print(json.dumps(data))
PYEOF
