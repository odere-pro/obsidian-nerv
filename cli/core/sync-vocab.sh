#!/usr/bin/env bash
# sync-vocab.sh — Autonomic skill: rebuild _vocab.<project>.md from note metadata
#
# Usage:
#   sync-vocab.sh <vault> <project_slug>
#   sync-vocab.sh vault=<name> <project_slug>
#
# Rebuilds _vocab.<project>.md with:
#   - Vocabulary tree grouped by spine (ROOT → BRANCH → LEAF)
#   - Overflow flags: BRANCH children > 7, LEAF children > 5
#   - ## Orphan Terms section listing notes without a spine
#   - Updates the `updated:` frontmatter date
#
# Idempotent: full regeneration on every run.
# Exit codes: 0 success; 1 error.
#
# STORY-012 — Implement sync-vocab.sh autonomic skill
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
  log_error "sync-vocab: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

js_slug="$(json_str "$PROJECT_SLUG")"

# ---------------------------------------------------------------------------
# Collect note metadata and rebuild vocab file in a single eval
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
VOCAB_JS=$(cat <<'JSEOF'
(async () => {
  var slug     = __SLUG__;
  var projDir  = 'projects/' + slug;
  var vocabPath = projDir + '/_vocab.' + slug + '.md';
  var today    = new Date().toISOString().split('T')[0];

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  // Collect metadata
  var entries = [];
  var orphans = [];

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var type  = fm.type   ? String(fm.type)  : 'LEAF';
    var spine = fm.spine  ? String(fm.spine) : '';
    var status = fm.status ? String(fm.status) : 'draft';
    var children = Array.isArray(fm.children) ? fm.children.length : 0;

    if (!spine) {
      orphans.push('[[' + f.basename + ']]');
      continue;
    }

    var overflow = '';
    if (type === 'BRANCH' && children > 7) overflow = ' ⚠ overflow (children: ' + children + ')';
    if (type === 'LEAF'   && children > 5) overflow = ' ⚠ overflow (children: ' + children + ')';

    entries.push({
      type: type, spine: spine, status: status,
      link: '[[' + f.basename + ']]',
      overflow: overflow
    });
  }

  // Sort: by spine asc, then type order ROOT/BRANCH/LEAF, then link asc
  var typeOrder = {ROOT: 0, BRANCH: 1, LEAF: 2};
  entries.sort(function(a, b) {
    if (a.spine < b.spine) return -1;
    if (a.spine > b.spine) return  1;
    var to = (typeOrder[a.type] || 2) - (typeOrder[b.type] || 2);
    if (to !== 0) return to;
    return a.link < b.link ? -1 : 1;
  });

  // Build markdown
  var lines = ['# Vocabulary — ' + slug, ''];
  var currentSpine = '';
  entries.forEach(function(e) {
    if (e.spine !== currentSpine) {
      if (currentSpine !== '') lines.push('');
      lines.push('## ' + e.spine);
      lines.push('');
      currentSpine = e.spine;
    }
    lines.push('- ' + e.link + ' (' + e.type + ', ' + e.status + ')' + e.overflow);
  });

  if (orphans.length > 0) {
    lines.push('');
    lines.push('## Orphan Terms');
    lines.push('');
    orphans.forEach(function(o) { lines.push('- ' + o); });
  }

  lines.push('');
  var newBody = lines.join('\n');

  // Update the vocab file (create if missing)
  var vocabFile = app.vault.getAbstractFileByPath(vocabPath);
  if (vocabFile) {
    await app.vault.modify(vocabFile, newBody);
    // Update updated: frontmatter date
    var vf2 = app.vault.getAbstractFileByPath(vocabPath);
    if (vf2) {
      await app.fileManager.processFrontMatter(vf2, function(fm) {
        fm.updated = today;
      });
    }
  } else {
    await app.vault.create(vocabPath, newBody);
  }

  return JSON.stringify({
    noteCount: notes.length,
    entryCount: entries.length,
    orphanCount: orphans.length
  });
})()
JSEOF
)
VOCAB_JS="${VOCAB_JS/__SLUG__/${js_slug}}"

result="$(ob_eval "$VAULT" "$VOCAB_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: sync-vocab: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

python3 - "$PROJECT_SLUG" "$result" <<'PYEOF'
import json, sys
slug   = sys.argv[1]
data   = json.loads(sys.argv[2])
n      = data.get('noteCount',  0)
e      = data.get('entryCount', 0)
o      = data.get('orphanCount', 0)
print('sync-vocab: {} note(s) scanned, {} vocab entries, {} orphan(s) written to _vocab.{}.md'.format(
    n, e, o, slug))
PYEOF
