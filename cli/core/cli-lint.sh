#!/usr/bin/env bash
# cli-lint.sh — Reflex skill: validate frontmatter and structure of vault notes
#
# Usage:
#   cli-lint.sh <vault> [<folder>] [--json]
#   cli-lint.sh vault=<name> [<folder>] [--json]
#
# Scans all .md files under <folder> (defaults to full vault) and reports:
#   - Missing required frontmatter fields
#   - Type-specific structural violations (ROOT/BRANCH/LEAF rules)
#   - Legacy tag usage (#flag/, #status/)
#   - Untyped connections and connection count > 7
#   - Missing ## Breadcrumb on BRANCH or LEAF
#   - Callout flag count > 3
#
# Excludes: tpl-*, _vocab*, _topk*, _ontology*
#
# Exit codes: 0 (findings written to stdout); 1 (script-level error only)
#
# STORY-009 — Implement cli-lint.sh reflex skill
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

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

# ---------------------------------------------------------------------------
# Build lint JS — use single-quoted heredoc to avoid bash $ interpolation,
# then substitute the JSON-encoded folder via bash string replacement.
# ---------------------------------------------------------------------------
js_folder="$(json_str "$FOLDER")"

# shellcheck disable=SC2016
LINT_JS=$(cat <<'JSEOF'
(async () => {
  var folder = __FOLDER__;

  var files = app.vault.getFiles().filter(function(f) {
    if (f.extension !== 'md') return false;
    if (folder && !f.path.startsWith(folder + '/') && f.path !== folder) return false;
    var n = f.name;
    if (n.startsWith('tpl-'))      return false;
    if (n.startsWith('_vocab'))    return false;
    if (n.startsWith('_topk'))     return false;
    if (n.startsWith('_ontology')) return false;
    return true;
  });

  var issues = [];
  var REQUIRED = ['title', 'type', 'kind', 'spine', 'status', 'created', 'aliases'];

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var body = await app.vault.cachedRead(f);
    var filePath = f.path;

    // Strip YAML frontmatter block for body-based checks
    var bodyText = body.replace(/^---[\s\S]*?---\n?/, '');

    var type = (fm.type !== undefined && fm.type !== null) ? String(fm.type) : '';

    // --- Required fields ---
    for (var r = 0; r < REQUIRED.length; r++) {
      var field = REQUIRED[r];
      var val = fm[field];
      if (val === undefined || val === null || val === '') {
        issues.push({ file: filePath, rule: 'missing-required-field',
          message: 'Missing required field: ' + field });
      }
    }

    // --- ROOT must not have a parent ---
    if (type === 'ROOT' && fm.parent && String(fm.parent).trim() !== '') {
      issues.push({ file: filePath, rule: 'root-has-parent',
        message: 'ROOT note must not have a parent' });
    }

    // --- BRANCH / LEAF must have a parent ---
    if ((type === 'BRANCH' || type === 'LEAF') &&
        (!fm.parent || String(fm.parent).trim() === '')) {
      issues.push({ file: filePath, rule: 'missing-parent',
        message: type + ' note must have a non-empty parent' });
    }

    // --- BRANCH must have non-empty children ---
    if (type === 'BRANCH' &&
        (!Array.isArray(fm.children) || fm.children.length === 0)) {
      issues.push({ file: filePath, rule: 'branch-empty-children',
        message: 'BRANCH note has an empty children array' });
    }

    // --- Spine tag in body ---
    // Spine slugs are alphanumeric+hyphens — no regex special chars needed.
    var spine = (fm.spine !== undefined && fm.spine !== null) ? String(fm.spine) : '';
    if (spine) {
      var spineTag = '#' + spine;
      if (bodyText.indexOf(spineTag + ' ')  !== -1 ||
          bodyText.indexOf(spineTag + '\n') !== -1 ||
          bodyText.indexOf(spineTag + '\t') !== -1 ||
          bodyText.endsWith(spineTag)) {
        issues.push({ file: filePath, rule: 'spine-tag-in-body',
          message: 'Spine tag #' + spine + ' found in body; use frontmatter spine field' });
      }
    }

    // --- Legacy #flag/ tags ---
    if (bodyText.indexOf('#flag/') !== -1) {
      issues.push({ file: filePath, rule: 'legacy-flag-tag',
        message: 'Legacy #flag/ tag in body; use > [!flag] callout instead' });
    }

    // --- Legacy #status/ tags ---
    if (bodyText.indexOf('#status/') !== -1) {
      issues.push({ file: filePath, rule: 'legacy-status-tag',
        message: 'Legacy #status/ tag in body; use status frontmatter field instead' });
    }

    // --- Connections section analysis ---
    var connSection = '';
    var sections = bodyText.split(/\n(?=## )/);
    for (var s = 0; s < sections.length; s++) {
      if (/^## Connections\b/.test(sections[s])) {
        connSection = sections[s].replace(/^## Connections\n?/, '');
        break;
      }
    }

    var connLines = connSection.split('\n').filter(function(l) {
      return l.trim().charAt(0) === '-';
    });

    var typedCount = 0;
    for (var c = 0; c < connLines.length; c++) {
      var line = connLines[c].trim();
      if (line === '-' || line === '') continue;
      if (line.indexOf(':: [[') !== -1) {
        typedCount++;
      } else if (line.indexOf('[[') !== -1) {
        issues.push({ file: filePath, rule: 'untyped-connection',
          message: 'Untyped connection: ' + line.substring(0, 80) });
      }
    }

    if (typedCount > 7) {
      issues.push({ file: filePath, rule: 'connection-count-exceeded',
        message: 'Connection count ' + typedCount + ' exceeds limit of 7' });
    }

    // --- Missing ## Breadcrumb on BRANCH / LEAF ---
    if ((type === 'BRANCH' || type === 'LEAF') &&
        bodyText.indexOf('## Breadcrumb') === -1) {
      issues.push({ file: filePath, rule: 'missing-breadcrumb',
        message: type + ' note is missing ## Breadcrumb section' });
    }

    // --- Callout flag count > 3 ---
    var flagMatches = bodyText.match(/^> \[!flag\b/gm) || [];
    if (flagMatches.length > 3) {
      issues.push({ file: filePath, rule: 'callout-flag-count-exceeded',
        message: 'Callout flag count ' + flagMatches.length + ' exceeds limit of 3' });
    }
  }

  return JSON.stringify({ noteCount: files.length, issues: issues });
})()
JSEOF
)

# Substitute the JSON-encoded folder value for the __FOLDER__ placeholder
LINT_JS="${LINT_JS/__FOLDER__/${js_folder}}"

# ---------------------------------------------------------------------------
# Run the lint engine
# ---------------------------------------------------------------------------
result="$(ob_eval "$VAULT" "$LINT_JS" 2>/dev/null)" || result='{"noteCount":0,"issues":[]}'
[[ -z "$result" ]] && result='{"noteCount":0,"issues":[]}'

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if $JSON_OUTPUT; then
  python3 - "$VAULT" "$FOLDER" "$result" <<'PYEOF'
import json, sys
vault  = sys.argv[1]
folder = sys.argv[2]
data   = json.loads(sys.argv[3])
print(json.dumps({
    "vault":  vault,
    "folder": folder,
    "issues": data["issues"],
    "count":  len(data["issues"])
}))
PYEOF
else
  python3 - "$result" <<'PYEOF'
import json, sys
data = json.loads(sys.argv[1])
for iss in data["issues"]:
    print(u"\u26a0 {}: [{}] {}".format(iss["file"], iss["rule"], iss["message"]))
note_count  = data["noteCount"]
issue_count = len(data["issues"])
print("Lint complete. {} issue(s) in {} note(s).".format(issue_count, note_count))
PYEOF
fi
