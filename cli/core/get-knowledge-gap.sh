#!/usr/bin/env bash
# get-knowledge-gap.sh — Sensory skill: identify structural deficiencies in a project
#
# Usage:
#   get-knowledge-gap.sh <vault|vault=name> <project_slug>
#
# Scans all notes in projects/<project_slug>/ (excluding _vocab*, _topk*,
# _ontology*, tpl-*) and returns a JSON report of structural gaps:
#
#   stubs         — body word count < 100 (frontmatter excluded)
#   noConnections — notes with zero typed connections
#   drafts        — notes whose status == "draft"
#   missingFields — notes missing any required frontmatter field
#   lowLinkCount  — ROOT or BRANCH notes with < 2 typed connections
#   unresolvedLinks — notes containing broken wikilinks
#
# Pre-check: calls `obsidian unresolved` as a fast-path check before the
# main eval pass. If unresolved count is 0 the per-note wikilink loop is
# skipped (O(1) instead of O(n×links)). Falls back gracefully if the
# direct command is unavailable.
#
# Output schema:
#   {
#     "stubs":          [{"note":"...","words":N}],
#     "noConnections":  ["..."],
#     "drafts":         [{"note":"...","kind":"...","spine":"..."}],
#     "missingFields":  [{"note":"...","missing":["kind","spine"]}],
#     "lowLinkCount":   [{"note":"...","links":N}],
#     "unresolvedLinks":[{"note":"...","broken":["[[BadRef]]"]}]
#   }
#
# Exit codes: 0 always (findings reported in JSON).
#
# STORY-019 — Implement get-knowledge-gap.sh and explain-topic.sh sensory skills
# STORY-029 — Integrate native CLI diagnostics (obsidian unresolved pre-check)
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

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
  printf 'ERROR: get-knowledge-gap: project slug must be lowercase alphanumeric with hyphens\n' >&2
  exit 1
fi

json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

js_slug="$(json_str "$PROJECT_SLUG")"

# ---------------------------------------------------------------------------
# Pre-check: obsidian unresolved (direct CLI command, STORY-029)
# If count == 0 we skip the per-note wikilink resolution loop in the eval.
# Falls back to skip=false (run the loop) when the command is unavailable.
# ---------------------------------------------------------------------------
SKIP_UNRESOLVED_LOOP=false
if unresolved_raw="$(obsidian unresolved vault="$VAULT" 2>/dev/null)"; then
  unresolved_precheck="$(printf '%s' "$unresolved_raw" | grep -c '\[\[' 2>/dev/null || echo 1)"
  if [[ "$unresolved_precheck" -eq 0 ]]; then
    SKIP_UNRESOLVED_LOOP=true
  fi
else
  printf 'WARN: get-knowledge-gap: obsidian unresolved unavailable, running full wikilink scan\n' >&2
fi

js_skip_unresolved="$([ "$SKIP_UNRESOLVED_LOOP" = true ] && echo 'true' || echo 'false')"

# ---------------------------------------------------------------------------
# Single-eval gap analysis IIFE — all checks in one pass for performance.
# Heredoc with __SLUG__ and __SKIP_UNRESOLVED__ placeholders; substituted after.
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
GAP_JS=$(cat <<'JSEOF'
(async () => {
  var slug             = __SLUG__;
  var skipUnresolved   = __SKIP_UNRESOLVED__;
  var projDir = 'projects/' + slug;

  var REQUIRED = ['title', 'type', 'kind', 'spine', 'status', 'created', 'aliases'];

  // In-scope notes: project folder, excluding system files
  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  var stubs          = [];
  var noConnections  = [];
  var drafts         = [];
  var missingFields  = [];
  var lowLinkCount   = [];
  var unresolvedLinks = [];

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var body  = await app.vault.cachedRead(f);

    // Strip YAML frontmatter block
    var bodyText = body.replace(/^---[\s\S]*?---\n?/, '');

    // --- Stub: body word count < 100 ---
    var words = bodyText.trim().split(/\s+/).filter(Boolean);
    if (words.length < 100) {
      stubs.push({ note: f.basename, words: words.length });
    }

    // --- Typed connection count (used for noConnections + lowLinkCount) ---
    var connSection = '';
    var sections = bodyText.split(/\n(?=## )/);
    for (var s = 0; s < sections.length; s++) {
      if (/^## Connections\b/.test(sections[s])) {
        connSection = sections[s].replace(/^## Connections\n?/, '');
        break;
      }
    }
    var typedConns = (connSection.match(/^- [a-z][a-z0-9-]* :: \[\[/gm) || []).length;

    // --- No typed connections ---
    if (typedConns === 0) {
      noConnections.push(f.basename);
    }

    // --- Draft status ---
    if (String(fm.status || '') === 'draft') {
      drafts.push({
        note:  f.basename,
        kind:  String(fm.kind  || ''),
        spine: String(fm.spine || '')
      });
    }

    // --- Missing required fields ---
    var missing = REQUIRED.filter(function(field) {
      var val = fm[field];
      return val === undefined || val === null || val === '';
    });
    if (missing.length > 0) {
      missingFields.push({ note: f.basename, missing: missing });
    }

    // --- Low link count: ROOT or BRANCH with < 2 typed connections ---
    var type = String(fm.type || '');
    if ((type === 'ROOT' || type === 'BRANCH') && typedConns < 2) {
      lowLinkCount.push({ note: f.basename, links: typedConns });
    }

    // --- Unresolved wikilinks (skipped when obsidian unresolved pre-check returned 0) ---
    if (!skipUnresolved) {
      var linkRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      var broken = [];
      var lm;
      while ((lm = linkRe.exec(bodyText)) !== null) {
        var target = lm[1].trim();
        if (!app.metadataCache.getFirstLinkpathDest(target, f.path)) {
          broken.push('[[' + lm[1] + ']]');
        }
      }
      if (broken.length > 0) {
        unresolvedLinks.push({ note: f.basename, broken: broken });
      }
    }
  }

  return JSON.stringify({
    stubs:           stubs,
    noConnections:   noConnections,
    drafts:          drafts,
    missingFields:   missingFields,
    lowLinkCount:    lowLinkCount,
    unresolvedLinks: unresolvedLinks
  });
})()
JSEOF
)

GAP_JS="${GAP_JS/__SLUG__/${js_slug}}"
GAP_JS="${GAP_JS/__SKIP_UNRESOLVED__/${js_skip_unresolved}}"

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
result="$(ob_eval "$VAULT" "$GAP_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: get-knowledge-gap: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

python3 - "$result" <<'PYEOF'
import json, sys
raw = sys.argv[1]
try:
    data = json.loads(raw)
    print(json.dumps(data))
except Exception as e:
    sys.stderr.write('ERROR: get-knowledge-gap: invalid JSON from eval: {}\n'.format(e))
    sys.exit(1)
PYEOF
