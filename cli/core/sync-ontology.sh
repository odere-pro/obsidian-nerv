#!/usr/bin/env bash
# sync-ontology.sh — Autonomic skill: produce ontology health report for a project
#
# Usage:
#   sync-ontology.sh <vault> <project_slug> [--json]
#   sync-ontology.sh vault=<name> <project_slug> [--json]
#
# Produces a comprehensive report:
#   - Entity type/kind/spine/status distribution
#   - Relationship type usage counts
#   - Missing inverse detection
#   - Summary line: "Total: N notes, M edges, avg X.X edges/note, P incomplete,
#                    Q missing inverses"
#
# JSON schema (--json):
#   {"entities":{"ROOT":N,"BRANCH":N,"LEAF":N},
#    "edges":M,"missingInverses":[{"source":"...","rel":"...","target":"..."}],
#    "incomplete":P}
#
# Exit codes: 0 success; 1 error.
#
# STORY-014 — Implement sync-ontology.sh autonomic skill
# Requires: lib.sh, cli-relations.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
JSON_OUTPUT=false
_ARGS=()
for _a in "$@"; do
  [[ "$_a" == "--json" ]] && JSON_OUTPUT=true || _ARGS+=("$_a")
done

if [[ ${#_ARGS[@]} -lt 2 ]]; then
  printf 'Usage: %s <vault|vault=name> <project_slug> [--json]\n' "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "${_ARGS[0]}")"
PROJECT_SLUG="${_ARGS[1]}"

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "sync-ontology: project slug must be lowercase alphanumeric with hyphens (got: $PROJECT_SLUG)"
fi

json_str() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"
}

CLI_RELATIONS="$SCRIPT_DIR/cli-relations.sh"
if [[ ! -x "$CLI_RELATIONS" ]]; then
  log_error "sync-ontology: cli-relations.sh not found at $CLI_RELATIONS"
fi

js_slug="$(json_str "$PROJECT_SLUG")"

# ---------------------------------------------------------------------------
# Step 1: Get edge list from cli-relations.sh --json
# ---------------------------------------------------------------------------
rel_json="$(bash "$CLI_RELATIONS" "$VAULT" "projects/${PROJECT_SLUG}" --json 2>/dev/null)" \
  || rel_json='{"edges":[],"summary":{},"unknownTypes":[]}'
[[ -z "$rel_json" ]] && rel_json='{"edges":[],"summary":{},"unknownTypes":[]}'

# ---------------------------------------------------------------------------
# Step 2: Collect note metadata for entity distribution
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016
META_JS=$(cat <<'JSEOF'
(async () => {
  var slug    = __SLUG__;
  var projDir = 'projects/' + slug;

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  var entities  = {ROOT: 0, BRANCH: 0, LEAF: 0};
  var kinds     = {};
  var spines    = {};
  var statuses  = {};
  var incomplete = 0;

  // Incomplete = missing any of title/type/kind/spine/status
  var REQUIRED = ['title', 'type', 'kind', 'spine', 'status'];

  notes.forEach(function(f) {
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};

    var type   = fm.type   ? String(fm.type)   : 'LEAF';
    var kind   = fm.kind   ? String(fm.kind)   : '';
    var spine  = fm.spine  ? String(fm.spine)  : '';
    var status = fm.status ? String(fm.status) : 'draft';

    if (entities[type] !== undefined) entities[type]++;
    else entities[type] = 1;

    if (kind)  { kinds[kind]   = (kinds[kind]   || 0) + 1; }
    if (spine) { spines[spine] = (spines[spine] || 0) + 1; }
    statuses[status] = (statuses[status] || 0) + 1;

    var missing = REQUIRED.some(function(k) {
      var v = fm[k];
      return v === undefined || v === null || v === '';
    });
    if (missing) incomplete++;
  });

  return JSON.stringify({
    noteCount: notes.length,
    entities:  entities,
    kinds:     kinds,
    spines:    spines,
    statuses:  statuses,
    incomplete: incomplete
  });
})()
JSEOF
)
META_JS="${META_JS/__SLUG__/${js_slug}}"

meta_result="$(ob_eval "$VAULT" "$META_JS" 2>/dev/null)" || meta_result=''
if [[ -z "$meta_result" ]]; then
  printf 'ERROR: sync-ontology: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: Compute missing inverses and emit report via Python
# ---------------------------------------------------------------------------
python3 - "$PROJECT_SLUG" "$rel_json" "$meta_result" "$JSON_OUTPUT" <<'PYEOF'
import json, sys, collections

slug       = sys.argv[1]
rel_data   = json.loads(sys.argv[2])
meta_data  = json.loads(sys.argv[3])
json_mode  = sys.argv[4] == 'true'

edges      = rel_data.get('edges', [])
entities   = meta_data.get('entities',  {})
kinds      = meta_data.get('kinds',     {})
spines     = meta_data.get('spines',    {})
statuses   = meta_data.get('statuses',  {})
note_count = meta_data.get('noteCount', 0)
incomplete = meta_data.get('incomplete', 0)

# Relationship usage counts
rel_counts = collections.Counter(e['rel'] for e in edges)
edge_count = len(edges)
avg_edges  = round(edge_count / max(note_count, 1), 1)

# Missing inverses: for each A --rel--> B, check B has inverse(rel) :: A
# We only check bidirectional integrity within the edge set itself (no ontology lookup here)
# Build a set of (target, rel, source) tuples to check against
forward_set = set()
for e in edges:
    forward_set.add((e.get('source',''), e.get('rel',''), e.get('target','')))

missing_inverses = []
# (Simplified: flag edges that have no corresponding reverse entry in the edge list)
# Full inverse lookup would require ontology parsing; this is best-effort
for e in edges:
    s = e.get('source','')
    r = e.get('rel','')
    t = e.get('target','')
    # Check if target has any edge pointing back to source
    has_reverse = any(
        e2.get('source','') == t and e2.get('target','') == s
        for e2 in edges
    )
    if not has_reverse:
        missing_inverses.append({'source': s, 'rel': r, 'target': t})

if json_mode:
    print(json.dumps({
        'entities':       entities,
        'edges':          edge_count,
        'missingInverses': missing_inverses[:20],  # cap to avoid huge output
        'incomplete':     incomplete
    }))
    sys.exit(0)

# Human-readable report
print('=== Ontology Health Report: {} ==='.format(slug))
print()

print('--- Entity Distribution ---')
for t in ('ROOT', 'BRANCH', 'LEAF'):
    print('  {}: {}'.format(t, entities.get(t, 0)))
print()

if kinds:
    print('--- Kind Distribution ---')
    for k, v in sorted(kinds.items(), key=lambda x: -x[1]):
        print('  {}: {}'.format(k, v))
    print()

if spines:
    print('--- Spine Distribution ---')
    for s, v in sorted(spines.items(), key=lambda x: -x[1]):
        print('  {}: {}'.format(s, v))
    print()

if statuses:
    print('--- Status Distribution ---')
    for st, v in sorted(statuses.items(), key=lambda x: -x[1]):
        print('  {}: {}'.format(st, v))
    print()

if rel_counts:
    print('--- Relationship Usage ---')
    for r, c in rel_counts.most_common():
        print('  {}: {}'.format(r, c))
    print()

if missing_inverses:
    print('--- Missing Inverses ({}) ---'.format(len(missing_inverses)))
    for mi in missing_inverses[:10]:
        print('  {} --{}-> {} (no reverse edge)'.format(mi['source'], mi['rel'], mi['target']))
    if len(missing_inverses) > 10:
        print('  ... and {} more'.format(len(missing_inverses) - 10))
    print()

print('Total: {} notes, {} edges, avg {:.1f} edges/note, {} incomplete, {} missing inverses'.format(
    note_count, edge_count, avg_edges, incomplete, len(missing_inverses)))
PYEOF
