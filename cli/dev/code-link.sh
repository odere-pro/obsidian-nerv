#!/usr/bin/env bash
# code-link.sh — Dev skill: append a code-path reference to ## Connections
#
# Usage:
#   code-link.sh <vault> "<note-path>" "<code-path>"
#   code-link.sh vault=<name> "<note-path>" "<code-path>"
#
# Appends the following line to the note's ## Connections section:
#   - implements :: `<code-path>`
#
# Idempotent: if the exact code-path is already present in ## Connections,
# exits 0 with no modification.
#
# Security: rejects code paths containing ]] or newlines.
#
# STORY-023 — Implement dev-specific skills
# Requires: lib.sh, Obsidian running (Limitation L1).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../core" && pwd)"
source "$CORE_DIR/lib.sh"

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 3 ]]; then
  printf 'Usage: %s <vault|vault=name> "<note-path>" "<code-path>"\n' \
    "$(basename "$0")" >&2
  exit 1
fi

VAULT="$(resolve_vault "$1")"
NOTE_PATH="$2"
CODE_PATH="$3"

# ---------------------------------------------------------------------------
# Validate code path (security: no ]] or newlines)
# ---------------------------------------------------------------------------
if printf '%s' "$CODE_PATH" | grep -qF ']]'; then
  printf 'ERROR: code-link: code path must not contain "]]\n' >&2
  exit 1
fi
if printf '%s' "$CODE_PATH" | grep -qP '\n|\r' 2>/dev/null || \
   [[ "$CODE_PATH" == *$'\n'* ]] || [[ "$CODE_PATH" == *$'\r'* ]]; then
  printf 'ERROR: code-link: code path must not contain newlines\n' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Atomic idempotent append via app.vault.process
# ---------------------------------------------------------------------------
json_str() { python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$1"; }

js_path="$(json_str "$NOTE_PATH")"
js_code="$(json_str "$CODE_PATH")"

# shellcheck disable=SC2016
LINK_JS=$(cat <<'JSEOF'
(async () => {
  var notePath = __NOTE_PATH__;
  var codePath = __CODE_PATH__;
  var newLine  = '- implements :: `' + codePath + '`';

  var f = app.vault.getAbstractFileByPath(notePath);
  if (!f) return JSON.stringify({ error: 'note not found: ' + notePath });

  var appended = false;

  await app.vault.process(f, function(content) {
    var marker = '## Connections';
    var idx    = content.indexOf(marker);
    if (idx === -1) return content;  // no Connections section — leave unchanged

    // Idempotency: scan the Connections section for the exact code path
    var afterMarker = content.substring(idx + marker.length);
    var nextSection = afterMarker.match(/\n## /);
    var connSection = nextSection
      ? afterMarker.substring(0, nextSection.index)
      : afterMarker;

    if (connSection.indexOf(codePath) !== -1) {
      return content;  // already present
    }

    appended = true;

    // Append before next section, or at end of content
    if (nextSection) {
      var insertAt = idx + marker.length + nextSection.index;
      return content.substring(0, insertAt) + '\n' + newLine + content.substring(insertAt);
    }
    return content.trimRight() + '\n' + newLine + '\n';
  });

  return JSON.stringify({ appended: appended, note: notePath, codePath: codePath });
})()
JSEOF
)

LINK_JS="${LINK_JS/__NOTE_PATH__/${js_path}}"
LINK_JS="${LINK_JS/__CODE_PATH__/${js_code}}"

result="$(ob_eval "$VAULT" "$LINK_JS" 2>/dev/null)" || result=''

if [[ -z "$result" ]]; then
  printf 'ERROR: code-link: Obsidian not reachable or eval failed\n' >&2
  exit 1
fi

python3 - "$result" <<'PYEOF'
import json, sys
raw = sys.argv[1]
try:
    data = json.loads(raw)
except Exception:
    sys.stderr.write('ERROR: code-link: invalid JSON from eval\n')
    sys.exit(1)

if 'error' in data:
    sys.stderr.write('ERROR: code-link: {}\n'.format(data['error']))
    sys.exit(1)

if data.get('appended'):
    print('code-link: appended to {}'.format(data['note']))
    print('  - implements :: `{}`'.format(data['codePath']))
else:
    print('code-link: already present (no change) in {}'.format(data['note']))
PYEOF
