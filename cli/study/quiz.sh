#!/usr/bin/env bash
# quiz.sh — Study skill: extract a shuffled note bundle for AI quiz generation
#
# Usage:
#   quiz.sh <vault|vault=name> <project_slug> <spine> [<limit>]
#
# Returns a vault-grounded quiz bundle: an instruction field that enforces
# vault-only questions, a spine label, and up to <limit> shuffled notes
# (default 5) with their title, kind, summary, first-500-chars of content,
# and typed connections.  Drafts are excluded.
#
# Output schema:
#   {
#     "instruction": "<system prompt fragment for quiz generation>",
#     "spine":  "<spine>",
#     "notes":  [
#       {"title":"...","kind":"...","summary":"...","content":"...","connections":[...]}
#     ]
#   }
#
# The instruction field explicitly states that only vault-provided note content
# may be used as the knowledge source — questions requiring external knowledge
# not present in the notes must be rejected.
#
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
if [[ $# -lt 3 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> <spine> [<limit>]\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
PROJECT_SLUG="$2"
SPINE="$3"
LIMIT="${4:-5}"

if [[ ! "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
  printf 'ERROR: quiz: limit must be a positive integer (got: %s)\n' "$LIMIT" >&2
  exit 1
fi

json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

js_slug="$(json_str "$PROJECT_SLUG")"
js_spine="$(json_str "$SPINE")"

# ---------------------------------------------------------------------------
# Single-eval IIFE — collect eligible notes; extract summary, content, edges.
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
QUIZ_JS=$(cat <<'JSEOF'
(async () => {
  var slug    = __SLUG__;
  var spine   = __SPINE__;
  var projDir = 'projects/' + slug;

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    if (n.startsWith('_vocab') || n.startsWith('_topk') ||
        n.startsWith('_ontology') || n.startsWith('tpl-')) return false;
    var cache  = app.metadataCache.getFileCache(f);
    var fm     = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var fSpine = String(fm.spine  || '');
    var status = String(fm.status || 'draft');
    return fSpine === spine && status !== 'draft';
  });

  var results = [];

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var body  = await app.vault.cachedRead(f);
    var bt    = body.replace(/^---[\s\S]*?---\n?/, '');

    // Summary section
    var sumM    = bt.match(/^## Summary\s*\n([\s\S]*?)(?=\n## |$)/m);
    var summary = sumM ? sumM[1].trim() : '';

    // Content section — first 500 chars
    var conM    = bt.match(/^## Content\s*\n([\s\S]*?)(?=\n## |$)/m);
    var content = conM ? conM[1].trim().substring(0, 500) : '';

    // Typed connections
    var connections = [];
    var connM = bt.match(/^## Connections\s*\n([\s\S]*?)(?=\n## |$)/m);
    if (connM) {
      var lines = connM[1].split('\n');
      for (var c = 0; c < lines.length; c++) {
        var m = lines[c].match(/^- ([a-z][a-z0-9-]*) :: \[\[([^\]]+)\]\]/);
        if (m) connections.push({ rel: m[1], target: m[2] });
      }
    }

    results.push({
      title:       String(fm.title || f.basename),
      kind:        String(fm.kind  || ''),
      summary:     summary,
      content:     content,
      connections: connections
    });
  }

  return JSON.stringify(results);
})()
JSEOF
)

QUIZ_JS="${QUIZ_JS/__SLUG__/${js_slug}}"
QUIZ_JS="${QUIZ_JS/__SPINE__/${js_spine}}"

raw="$(ob_eval "$VAULT" "$QUIZ_JS" 2>/dev/null)" || raw=''

if [[ -z "$raw" ]]; then
  printf 'ERROR: quiz: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Shuffle notes (Python random.shuffle) and apply limit; assemble final output.
# The instruction field enforces vault-grounded questions only.
# ---------------------------------------------------------------------------
python3 - "$raw" "$SPINE" "$LIMIT" <<'PYEOF'
import json, sys, random

try:
    notes = json.loads(sys.argv[1])
except Exception as e:
    sys.stderr.write('ERROR: quiz: invalid JSON from eval: {}\n'.format(e))
    sys.exit(1)

spine = sys.argv[2]
limit = int(sys.argv[3])

random.shuffle(notes)
notes = notes[:limit]

instruction = (
    "You are a quiz generator grounded exclusively in the user's knowledge vault. "
    "Generate quiz questions that can ONLY be answered from the note content provided "
    "below. Do not ask questions that require knowledge not present in the provided "
    "notes — reject any question that cannot be answered from the supplied content. "
    "For each question, cite the source note title. "
    "After the quiz, identify which notes correspond to incorrectly answered questions "
    "and offer the user a chance to review or enrich those specific notes in their vault."
)

print(json.dumps({
    "instruction": instruction,
    "spine":       spine,
    "notes":       notes
}))
PYEOF
