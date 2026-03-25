#!/usr/bin/env bash
# sync-topk.sh — Autonomic skill: append overflow log entries to _topk.<project>.md
#
# Usage:
#   sync-topk.sh <vault> <project_slug>
#   sync-topk.sh vault=<name> <project_slug>
#
# Scans every note in projects/<project_slug>/ (excluding _ontology*, _vocab*,
# _topk*, tpl-*) and appends one row per violation to ## Overflow Log in
# _topk.<project_slug>.md:
#
#   Limit            Threshold
#   connections      > 7
#   callout-flags    > 3
#   children         > 7  (BRANCH notes only)
#
# Row format: | date | [[note]] | field | count | threshold |
# Deduplication: rows already containing the same note+field are skipped.
# Updates the `updated:` frontmatter date on every run.
# Warns (but does not error) when the overflow log reaches 200 rows.
#
# Exit codes: 0 success; 1 script-level error.
#
# STORY-013 — Implement sync-topk.sh autonomic skill
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
  log_error "sync-topk: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

# ---------------------------------------------------------------------------
# Build and run the sync JS — single eval call for performance.
# Single-quoted heredoc avoids bash $ interpolation; __SLUG__ is substituted.
# ---------------------------------------------------------------------------
js_slug="$(json_str "$PROJECT_SLUG")"

# shellcheck disable=SC2016
SYNC_JS=$(cat <<'JSEOF'
(async () => {
  var slug     = __SLUG__;
  var projDir  = 'projects/' + slug;
  var topkPath = projDir + '/_topk.' + slug + '.md';

  // Collect in-scope notes
  var notes = app.vault.getFiles().filter(function(f) {
    if (f.extension !== 'md') return false;
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_ontology') &&
           !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('tpl-');
  });

  var today    = new Date().toISOString().split('T')[0];
  var violations = [];

  for (var i = 0; i < notes.length; i++) {
    var f    = notes[i];
    var body = await app.vault.cachedRead(f);
    var cache = app.metadataCache.getFileCache(f);
    var fm   = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var link = '[[' + f.basename + ']]';

    // Typed connection count (lines matching "- <type> :: [[")
    var connMatches = body.match(/^- [a-z][\w-]* :: \[\[/gm) || [];
    if (connMatches.length > 7) {
      violations.push({ note: link, field: 'connections',
        count: connMatches.length, threshold: 7 });
    }

    // Callout flag count
    var flagMatches = body.match(/^> \[!flag\b/gm) || [];
    if (flagMatches.length > 3) {
      violations.push({ note: link, field: 'callout-flags',
        count: flagMatches.length, threshold: 3 });
    }

    // BRANCH children count
    var type = (fm.type !== undefined) ? String(fm.type) : '';
    if (type === 'BRANCH' && Array.isArray(fm.children) && fm.children.length > 7) {
      violations.push({ note: link, field: 'children',
        count: fm.children.length, threshold: 7 });
    }
  }

  // Locate the _topk file
  var topkFile = app.vault.getAbstractFileByPath(topkPath);
  if (!topkFile) {
    return JSON.stringify({ error: 'topk file not found: ' + topkPath });
  }

  var appended = 0;
  var warning  = '';

  // Atomic read-modify-write of the overflow log section
  await app.vault.process(topkFile, function(content) {
    var logHeader = '## Overflow Log';
    var logIdx = content.indexOf(logHeader);
    if (logIdx === -1) return content;

    var afterHeader = content.substring(logIdx + logHeader.length);
    var nextMatch   = afterHeader.match(/\n## /);
    var logSection  = nextMatch
      ? afterHeader.substring(0, nextMatch.index)
      : afterHeader;

    var existingRows = logSection.split('\n').filter(function(l) {
      return l.trimLeft().charAt(0) === '|';
    });

    if (existingRows.length >= 200) {
      warning = 'Overflow log has reached the 200-row cap. Operator cleanup required.';
      return content;
    }

    var newRows = '';
    for (var v = 0; v < violations.length; v++) {
      var viol = violations[v];
      var dup = existingRows.some(function(r) {
        return r.indexOf(viol.note) !== -1 && r.indexOf(viol.field) !== -1;
      });
      if (!dup && (existingRows.length + appended) < 200) {
        newRows += '\n| ' + today + ' | ' + viol.note +
                   ' | ' + viol.field +
                   ' | ' + viol.count +
                   ' | ' + viol.threshold + ' |';
        appended++;
      }
    }

    if (newRows === '') return content;

    // Insert new rows before the next section, or at end of file
    if (nextMatch) {
      var insertAt = logIdx + logHeader.length + nextMatch.index;
      return content.substring(0, insertAt) + newRows + content.substring(insertAt);
    }
    return content.trimRight() + newRows + '\n';
  });

  // Update `updated:` frontmatter date
  var topkAfter = app.vault.getAbstractFileByPath(topkPath);
  if (topkAfter) {
    await app.fileManager.processFrontMatter(topkAfter, function(fm) {
      fm.updated = today;
    });
  }

  return JSON.stringify({ appended: appended, warning: warning, noteCount: notes.length });
})()
JSEOF
)

SYNC_JS="${SYNC_JS/__SLUG__/${js_slug}}"

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
result="$(ob_eval "$VAULT" "$SYNC_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: sync-topk: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

# Check for JS-level error
error_msg="$(python3 -c "
import json,sys
d=json.loads(sys.argv[1])
print(d.get('error',''))
" "$result" 2>/dev/null || echo '')"

if [[ -n "$error_msg" ]]; then
  printf 'ERROR: sync-topk: %s\n' "$error_msg" >&2
  exit 1
fi

# Extract fields and report
python3 - "$PROJECT_SLUG" "$result" <<'PYEOF'
import json, sys
slug   = sys.argv[1]
data   = json.loads(sys.argv[2])
n      = data.get('noteCount', 0)
added  = data.get('appended',  0)
warn   = data.get('warning',   '')
print('sync-topk: {} note(s) scanned, {} overflow row(s) appended to _topk.{}.md'.format(n, added, slug))
if warn:
    print('WARN: ' + warn)
PYEOF
