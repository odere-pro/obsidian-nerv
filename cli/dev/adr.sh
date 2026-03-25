#!/usr/bin/env bash
# adr.sh — Dev skill: create an Architecture Decision Record as a LEAF note
#
# Usage:
#   adr.sh <vault> <project_slug> "<title>" [<parent_slug>]
#   adr.sh vault=<name> <project_slug> "<title>" [<parent_slug>]
#
# Creates a LEAF note with:
#   kind: decision
#   decision-date: YYYY-MM-DD
#   decision-status: proposed
#   ## Content subsections: ### Context, ### Decision, ### Consequences
#
# The slug is auto-generated: adr-YYYYMMDD-<slugified-title>
# Note creation delegates entirely to create-entity.sh (STORY-006) so that
# parent wiring and daily-note logging follow the established entity rules.
#
# STORY-023 — Implement dev-specific skills
# Requires: lib.sh, create-entity.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../core" && pwd)"
source "$CORE_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 3 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> "<title>" [<parent_slug>]\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
PROJECT_SLUG="$2"
TITLE="$3"
PARENT_SLUG="${4:-ROOT}"

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "adr: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

# ---------------------------------------------------------------------------
# Generate ADR slug: adr-YYYYMMDD-<slugified-title>
# ---------------------------------------------------------------------------
TODAY="$(date +%Y-%m-%d)"
DATE_COMPACT="$(date +%Y%m%d)"

ADR_SLUG="adr-${DATE_COMPACT}-$(printf '%s' "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | tr ' ' '-' \
  | tr -cd 'a-z0-9-' \
  | sed 's/--*/-/g; s/^-//; s/-$//')"

# ---------------------------------------------------------------------------
# Delegate note creation to create-entity.sh
# ---------------------------------------------------------------------------
CREATE_ENTITY="$CORE_DIR/create-entity.sh"
if [[ ! -x "$CREATE_ENTITY" ]]; then
  log_error "adr: create-entity.sh not found at $CREATE_ENTITY"
fi

if ! bash "$CREATE_ENTITY" "$VAULT" "$PROJECT_SLUG" LEAF \
    "$ADR_SLUG" "$TITLE" "$PARENT_SLUG" decision --json > /dev/null; then
  printf 'ERROR: adr: create-entity.sh failed\n' >&2
  exit 1
fi

# Resolve created note path: projects/<project>/<UPPER>.<slug> - <Title>.md
PROJ_UPPER="$(printf '%s' "$PROJECT_SLUG" | tr '[:lower:]' '[:upper:]')"
NOTE_PATH="projects/${PROJECT_SLUG}/${PROJ_UPPER}.${ADR_SLUG} - ${TITLE}.md"

# ---------------------------------------------------------------------------
# Patch frontmatter: add decision-date and decision-status
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

js_path="$(json_str "$NOTE_PATH")"
js_date="$(json_str "$TODAY")"

patch_fm_js="(async () => {
  var f = app.vault.getAbstractFileByPath(${js_path});
  if (!f) return 'not-found';
  await app.fileManager.processFrontMatter(f, function(fm) {
    fm['decision-date']   = ${js_date};
    fm['decision-status'] = 'proposed';
  });
  return 'ok';
})()"

result="$(ob_eval "$VAULT" "$patch_fm_js" 2>/dev/null)" || result=''
if [[ "$result" == "not-found" || -z "$result" ]]; then
  printf 'ERROR: adr: could not locate created note at %s\n' "$NOTE_PATH" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Patch ## Content with ADR subsections
# ---------------------------------------------------------------------------
js_context_hint="$(json_str "*What problem or force is driving this decision?*")"
js_decision_hint="$(json_str "*What was decided? State it as a full sentence.*")"
js_consequences_hint="$(json_str "*What are the resulting trade-offs, risks, and obligations?*")"

patch_content_js="(async () => {
  var f = app.vault.getAbstractFileByPath(${js_path});
  if (!f) return 'not-found';
  await app.vault.process(f, function(content) {
    var marker = '## Content';
    var idx = content.indexOf(marker);
    if (idx === -1) return content;
    var after = content.substring(idx + marker.length);
    // Only patch if no subsections already present
    if (after.indexOf('### Context') !== -1) return content;
    var nextSection = after.match(/\n## /);
    var insertAt = nextSection
      ? idx + marker.length + nextSection.index
      : content.length;
    var subsections = '\n\n### Context\n\n' + ${js_context_hint} +
      '\n\n### Decision\n\n' + ${js_decision_hint} +
      '\n\n### Consequences\n\n' + ${js_consequences_hint} + '\n';
    return content.substring(0, idx + marker.length) +
           subsections +
           content.substring(insertAt);
  });
  return 'ok';
})()"

result2="$(ob_eval "$VAULT" "$patch_content_js" 2>/dev/null)" || result2=''
if [[ "$result2" == "not-found" || -z "$result2" ]]; then
  printf 'ERROR: adr: could not patch Content sections for %s\n' "$NOTE_PATH" >&2
  exit 1
fi

printf 'ADR created: %s\n' "$NOTE_PATH"
printf '  decision-date:   %s\n' "$TODAY"
printf '  decision-status: proposed\n'
