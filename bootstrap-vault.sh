#!/usr/bin/env bash
# bootstrap-vault.sh — Idempotent Obsidian vault provisioner
# Usage: bootstrap-vault.sh <vault-name> <vault-path>
# Example: bootstrap-vault.sh study ~/vaults/study
set -euo pipefail

# ---------------------------------------------------------------------------
# Args & validation
# ---------------------------------------------------------------------------
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <vault-name> <vault-path>" >&2
  exit 1
fi

VAULT_NAME="$1"
VAULT_PATH_RAW="$2"

# Resolve to absolute path (handles ~ expansion and relative paths)
VAULT_PATH="$(eval echo "$VAULT_PATH_RAW")"
VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" 2>/dev/null && pwd)/$(basename "$VAULT_PATH")" || true
# If directory doesn't exist yet, resolve parent and append basename
if [[ ! -d "$VAULT_PATH" ]]; then
  _parent="$(dirname "$VAULT_PATH")"
  _base="$(basename "$VAULT_PATH")"
  mkdir -p "$_parent"
  VAULT_PATH="$(cd "$_parent" && pwd)/$_base"
fi

# Validate vault name (no path separators, no spaces)
if [[ "$VAULT_NAME" == */* || "$VAULT_NAME" == *\\* || "$VAULT_NAME" == *" "* ]]; then
  echo "Error: vault name must not contain path separators or spaces" >&2
  exit 1
fi

echo "==> Bootstrapping vault '${VAULT_NAME}' at '${VAULT_PATH}'"

# ---------------------------------------------------------------------------
# Helper: write file only if it doesn't exist (idempotency)
# ---------------------------------------------------------------------------
write_if_absent() {
  local target="$1"
  local content="$2"
  if [[ ! -f "$target" ]]; then
    printf '%s' "$content" > "$target"
    echo "    created: $target"
  fi
}

# ---------------------------------------------------------------------------
# 1. Vault directory + .obsidian/
# ---------------------------------------------------------------------------
mkdir -p "${VAULT_PATH}/.obsidian"

# ---------------------------------------------------------------------------
# 2. Vault folders
# ---------------------------------------------------------------------------
for dir in \
  "_inbox" \
  "_templates" \
  "_scripts" \
  "_scripts/cli" \
  "_bases" \
  "journals/daily" \
  "projects"; do
  mkdir -p "${VAULT_PATH}/${dir}"
done

# ---------------------------------------------------------------------------
# 3. .obsidian/app.json
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/app.json" '{
  "newFileLocation": "folder",
  "newFileFolderPath": "_inbox",
  "attachmentFolderPath": "_attachments",
  "useMarkdownLinks": false,
  "newLinkFormat": "shortest",
  "autoUpdateInternalLinks": true,
  "trashOption": "system",
  "userIgnoreFilters": [
    "_templates/*",
    "_scripts/*"
  ],
  "propertiesInDocument": "visible",
  "strictLineBreaks": false,
  "showInlineTitle": true,
  "readableLineLength": true
}'

# ---------------------------------------------------------------------------
# 4. .obsidian/core-plugins.json
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/core-plugins.json" '[
  "file-explorer",
  "global-search",
  "switcher",
  "graph",
  "backlink",
  "canvas",
  "outgoing-link",
  "tag-pane",
  "page-preview",
  "daily-notes",
  "templates",
  "note-composer",
  "command-palette",
  "editor-status",
  "bookmarks",
  "properties",
  "outline",
  "word-count",
  "file-recovery",
  "workspaces",
  "bases"
]'

# Explicit enabled/disabled map for core plugins
write_if_absent "${VAULT_PATH}/.obsidian/core-plugins-migration.json" '{
  "file-explorer": true,
  "global-search": true,
  "switcher": true,
  "graph": true,
  "backlink": true,
  "outgoing-link": true,
  "tag-pane": true,
  "page-preview": true,
  "daily-notes": true,
  "templates": true,
  "note-composer": true,
  "command-palette": true,
  "bookmarks": true,
  "properties": true,
  "outline": true,
  "word-count": true,
  "file-recovery": true,
  "workspaces": true,
  "bases": true
}'

# ---------------------------------------------------------------------------
# 5. .obsidian/templates.json
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/templates.json" '{
  "folder": "_templates",
  "dateFormat": "YYYY-MM-DD",
  "timeFormat": "HH:mm"
}'

# ---------------------------------------------------------------------------
# 6. .obsidian/daily-notes.json
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/daily-notes.json" '{
  "dateFormat": "YYYY-MM-DD",
  "newFileLocation": "journals/daily/",
  "template": "_templates/tpl-daily.md"
}'

# ---------------------------------------------------------------------------
# 7. .obsidian/hotkeys.json
# Hotkey IDs are Obsidian internal command IDs
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/hotkeys.json" '{
  "templates:insert-template": [
    {
      "modifiers": ["Alt"],
      "key": "T"
    }
  ],
  "switcher:open": [
    {
      "modifiers": ["Mod"],
      "key": "O"
    }
  ],
  "global-search:open": [
    {
      "modifiers": ["Mod", "Shift"],
      "key": "F"
    }
  ],
  "graph:open": [
    {
      "modifiers": ["Mod"],
      "key": "G"
    }
  ],
  "backlink:open-backlinks": [
    {
      "modifiers": ["Alt"],
      "key": "B"
    }
  ],
  "editor:open-search": [
    {
      "modifiers": ["Mod"],
      "key": ";"
    }
  ],
  "command-palette:open": [
    {
      "modifiers": ["Alt"],
      "key": "C"
    }
  ],
  "daily-notes:goto-today": [
    {
      "modifiers": ["Alt"],
      "key": "D"
    }
  ],
  "workspaces:open": [
    {
      "modifiers": ["Alt"],
      "key": "W"
    }
  ]
}'

# ---------------------------------------------------------------------------
# 8. .obsidian/graph.json
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/graph.json" '{
  "collapse-filter": false,
  "search": "",
  "showTags": true,
  "showAttachments": true,
  "hideUnresolved": false,
  "showOrphans": true,
  "collapse-color-groups": false,
  "colorGroups": [
    {
      "query": "path:_inbox/",
      "color": {
        "a": 1,
        "rgb": 14701138
      }
    },
    {
      "query": "tag:#spine/core",
      "color": {
        "a": 1,
        "rgb": 3394662
      }
    },
    {
      "query": "tag:#spine/project",
      "color": {
        "a": 1,
        "rgb": 5614284
      }
    }
  ],
  "collapse-display": false,
  "showArrow": true,
  "textFadeMultiplier": 0,
  "nodeSizeMultiplier": 1,
  "lineSizeMultiplier": 1,
  "collapse-forces": false,
  "centerStrength": 0.518713248970312,
  "repelStrength": 10,
  "linkStrength": 1,
  "linkDistance": 250,
  "scale": 1,
  "close": false
}'

# ---------------------------------------------------------------------------
# 9. .obsidian/workspace.json (placeholder — operator finalizes in STORY-002)
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/workspace.json" '{
  "main": {
    "id": "placeholder",
    "type": "split",
    "children": [],
    "direction": "vertical"
  },
  "left": {
    "id": "left-ribbon",
    "type": "split",
    "children": [],
    "direction": "horizontal",
    "width": 300
  },
  "right": {
    "id": "right-panel",
    "type": "split",
    "children": [],
    "direction": "horizontal",
    "width": 300
  },
  "active": "",
  "lastOpenFiles": []
}'

# ---------------------------------------------------------------------------
# 10. .obsidian/workspaces.json (placeholder — operator finalizes in STORY-002)
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/workspaces.json" '{
  "workspaces": {},
  "active": ""
}'

# ---------------------------------------------------------------------------
# 11. .obsidian/bookmarks.json (placeholder — operator finalizes in STORY-002)
# ---------------------------------------------------------------------------
write_if_absent "${VAULT_PATH}/.obsidian/bookmarks.json" '{
  "items": []
}'

# ---------------------------------------------------------------------------
# 12. Templates — _templates/
# ---------------------------------------------------------------------------

# tpl-root.md
write_if_absent "${VAULT_PATH}/_templates/tpl-root.md" '---
title: "{{title}}"
aliases: []
type: ROOT
kind: concept
parent: ""
children: []
spine: ""
status: draft
attachments: []
created: {{date}}
modified: {{date}}
---

## Summary

<!-- High-level description of this root concept -->

## Map

<!-- Structure and sub-topics of this domain -->

> [!note]- Project Base
> ![[PROJECT_SLUG_PLACEHOLDER.base]]

## Connections

<!-- Key relationships to other roots and branches -->

## Flags

<!-- Open questions, blockers, decisions pending -->
'

# tpl-branch.md
write_if_absent "${VAULT_PATH}/_templates/tpl-branch.md" '---
title: "{{title}}"
aliases: []
type: BRANCH
kind: concept
parent: ""
children: []
spine: ""
status: draft
attachments: []
created: {{date}}
modified: {{date}}
---

## Breadcrumb

<!-- Path from ROOT: ROOT → ... → this BRANCH -->

## Summary

<!-- What this branch covers -->

## Content

<!-- Main knowledge content for this branch -->

## Connections

<!-- Links to related branches and leaves -->

## Flags

<!-- Open questions, blockers, decisions pending -->
'

# tpl-leaf.md
write_if_absent "${VAULT_PATH}/_templates/tpl-leaf.md" '---
title: "{{title}}"
aliases: []
type: LEAF
kind: concept
parent: ""
children: []
spine: ""
status: draft
attachments: []
created: {{date}}
modified: {{date}}
---

## Breadcrumb

<!-- Path from ROOT: ROOT → BRANCH → ... → this LEAF -->

## Summary

<!-- One-paragraph summary of this leaf concept -->

## Content

<!-- Detailed knowledge content -->

## Connections

<!-- Links to related leaves and branches -->

## Flags

<!-- Open questions, blockers, decisions pending -->
'

# tpl-inbox.md
write_if_absent "${VAULT_PATH}/_templates/tpl-inbox.md" '---
title: "{{title}}"
captured: {{date}}
source: ""
target: ""
status: inbox
---

> [!todo] Triage
> - [ ] Identify note type (LEAF / BRANCH / ROOT)
> - [ ] Determine parent
> - [ ] Move to correct project folder
> - [ ] Delete this inbox copy

## Raw

<!-- Paste raw captured content here -->

## Placement Notes

<!-- Where should this go? What spine does it belong to? -->
'

# tpl-daily.md
write_if_absent "${VAULT_PATH}/_templates/tpl-daily.md" '---
title: "{{date}}"
type: daily-note
date: {{date}}
tags: [journal/daily]
---

## Ontology Work Log

### Entities Created

<!-- List new notes created today -->

### Schema Changes

<!-- Frontmatter changes, new relationship types, type renames -->

### Decisions

<!-- Architectural or naming decisions made -->

### Open Questions

<!-- Questions surfaced that need follow-up -->

## Triage

```query
path:_inbox
```

## Tasks

- [ ]

## Notes

<!-- Freeform notes for the day -->
'

# tpl-ontology.md
write_if_absent "${VAULT_PATH}/_templates/tpl-ontology.md" '---
title: "{{title}} Ontology"
type: ONTOLOGY
spine: ""
status: active
created: {{date}}
modified: {{date}}
---

# Relationship Types

| `type` | Direction | `inverse` | Description |
|--------|-----------|-----------|-------------|
| `triggers` | A → B | `triggered-by` | A causes B to occur |
| `depends-on` | A → B | `depended-by` | A requires B to function |
| `implements` | A → B | `implemented-by` | A is a concrete realization of B |
| `extends` | A → B | `extended-by` | A adds to or specializes B |
| `compares-to` | A ↔ B | `compares-to` | A and B are compared or contrasted |
| `replaces` | A → B | `replaced-by` | A supersedes or deprecates B |
| `feeds-data` | A → B | `fed-data-by` | A supplies data consumed by B |
| `authenticates-via` | A → B | `authenticated-by` | A uses B for identity verification |
| `contains` | A → B | `contained-by` | A is a parent container of B |
| `mitigates` | A → B | `mitigated-by` | A reduces the risk or impact of B |

## Custom Types

<!-- Add project-specific relationship types below (include inverse column) -->

| `type` | Direction | `inverse` | Description |
|--------|-----------|-----------|-------------|
'

# tpl-vocab.md
write_if_absent "${VAULT_PATH}/_templates/tpl-vocab.md" '---
title: "{{title}} Vocabulary"
type: VOCAB
spine: ""
status: active
created: {{date}}
modified: {{date}}
---

# Vocabulary

## L0 — Core Terms

<!-- Foundational terms required to understand the domain -->

## L1 — Primary Terms

<!-- Primary domain terms -->

## L2 — Secondary Terms

<!-- Supporting terms -->

## L3 — Peripheral Terms

<!-- Edge-case or rarely-used terms -->

## Shared Terms

<!-- Terms shared with other spines — link to canonical definition -->

## Orphan Terms

<!-- Terms not yet categorized -->
'

# tpl-topk.md
write_if_absent "${VAULT_PATH}/_templates/tpl-topk.md" '---
title: "{{title}} Top-K"
type: TOPK
spine: ""
status: active
created: {{date}}
modified: {{date}}
---

# Top-K Limits

| Category | Limit | Current Count | Notes |
|----------|-------|---------------|-------|
| Root notes | 10 | 0 | Hard cap — split spine if exceeded |
| Branch notes per root | 20 | 0 | |
| Leaf notes per branch | 50 | 0 | |
| Relationship types | 15 | 10 | Includes 10 defaults |
| Vocab terms (total) | 200 | 0 | |

## Overflow Log

<!-- Record here when a limit is approached or exceeded -->

## Split History

<!-- Record spine splits performed to maintain top-k limits -->
'

# tpl-project.base (.base file — JSON/YAML format)
write_if_absent "${VAULT_PATH}/_templates/tpl-project.base" 'filters:
  and:
    - file.inFolder("projects/PROJECT_SLUG_PLACEHOLDER")
    - '"'"'file.ext == "md"'"'"'
formulas:
  status_icon: '"'"'if(status == "active", "🟢", if(status == "draft", "🟡", if(status == "archived", "⚫", "⚪")))'"'"'
  last_updated: '"'"'file.mtime.relative()'"'"'
  link_count: '"'"'file.links.length'"'"'
properties:
  formula.status_icon:
    displayName: ""
  formula.last_updated:
    displayName: Updated
  formula.link_count:
    displayName: Links
views:
  - type: table
    name: All Notes
    groupBy:
      property: type
      direction: ASC
    order:
      - formula.status_icon
      - file.name
      - type
      - status
      - formula.last_updated
      - formula.link_count
  - type: table
    name: Drafts
    filters:
      and:
        - '"'"'status == "draft"'"'"'
    order:
      - formula.status_icon
      - file.name
      - type
      - formula.last_updated
  - type: cards
    name: Browse
    order:
      - file.name
      - type
      - formula.status_icon
      - formula.last_updated
'

# ---------------------------------------------------------------------------
# 13. Audit bases — _bases/
# ---------------------------------------------------------------------------

# audit-missing-properties.base
write_if_absent "${VAULT_PATH}/_bases/audit-missing-properties.base" 'filters:
  and:
    - file.inFolder("projects")
    - '"'"'file.ext == "md"'"'"'
    - or:
        - '"'"'type == ""'"'"'
        - '"'"'status == ""'"'"'
        - '"'"'spine == ""'"'"'
formulas:
  missing_fields: '"'"'(if(type.isEmpty(), "type ", "") + if(status.isEmpty(), "status ", "") + if(spine.isEmpty(), "spine", "")).trim()'"'"'
properties:
  formula.missing_fields:
    displayName: Missing Fields
views:
  - type: table
    name: Missing Properties
    order:
      - file.name
      - formula.missing_fields
      - file.folder
      - file.mtime
'

# audit-drafts.base
write_if_absent "${VAULT_PATH}/_bases/audit-drafts.base" 'filters:
  and:
    - '"'"'file.ext == "md"'"'"'
    - '"'"'status == "draft"'"'"'
    - not:
        - file.inFolder("_templates")
        - file.inFolder("_inbox")
formulas:
  days_as_draft: '"'"'(now() - file.ctime).days.round(0)'"'"'
  last_updated: '"'"'file.mtime.relative()'"'"'
properties:
  formula.days_as_draft:
    displayName: Days as Draft
  formula.last_updated:
    displayName: Last Updated
views:
  - type: table
    name: All Drafts
    groupBy:
      property: type
      direction: ASC
    order:
      - file.name
      - type
      - formula.days_as_draft
      - formula.last_updated
      - spine
'

# audit-orphans.base
write_if_absent "${VAULT_PATH}/_bases/audit-orphans.base" 'filters:
  and:
    - '"'"'file.ext == "md"'"'"'
    - not:
        - file.inFolder("_templates")
        - file.inFolder("_inbox")
        - file.inFolder("journals")
formulas:
  has_parent: '"'"'if(parent.isEmpty(), "⚠️ orphan", "✅ linked")'"'"'
  link_count: '"'"'file.links.length'"'"'
  backlink_count: '"'"'file.backlinks.length'"'"'
properties:
  formula.has_parent:
    displayName: Parent Status
  formula.link_count:
    displayName: Links Out
  formula.backlink_count:
    displayName: Links In
views:
  - type: table
    name: Orphan Notes
    filters:
      and:
        - '"'"'parent == ""'"'"'
    order:
      - formula.has_parent
      - file.name
      - type
      - formula.link_count
      - formula.backlink_count
  - type: table
    name: All Connectivity
    order:
      - file.name
      - formula.has_parent
      - formula.link_count
      - formula.backlink_count
'

# ---------------------------------------------------------------------------
# 14. Host CLI directories
# ---------------------------------------------------------------------------
mkdir -p \
  "${HOME}/.ontology-cli/core" \
  "${HOME}/.ontology-cli/agent" \
  "${HOME}/.ontology-cli/study" \
  "${HOME}/.ontology-cli/dev"

# ---------------------------------------------------------------------------
# 15. Agent config — deploy skills.md and vault CLAUDE.md (STORY-020)
# ---------------------------------------------------------------------------
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_SRC="${REPO_DIR}/cli/agent"

# Deploy shared skill registry (idempotent overwrite — always keep current)
if [[ -f "${AGENT_SRC}/skills.md" ]]; then
  cp "${AGENT_SRC}/skills.md" "${HOME}/.ontology-cli/agent/skills.md"
  echo "    deployed: ~/.ontology-cli/agent/skills.md"
fi

# Deploy per-vault CLAUDE.md if a matching source exists
if [[ -f "${AGENT_SRC}/${VAULT_NAME}/CLAUDE.md" ]]; then
  cp "${AGENT_SRC}/${VAULT_NAME}/CLAUDE.md" "${VAULT_PATH}/CLAUDE.md"
  echo "    deployed: ${VAULT_PATH}/CLAUDE.md"
fi

# ---------------------------------------------------------------------------
# 16. PATH export in ~/.zprofile (idempotent)
# ---------------------------------------------------------------------------
ZPROFILE="${HOME}/.zprofile"
PATH_EXPORT='export PATH="${HOME}/.ontology-cli/core:${HOME}/.ontology-cli/agent:${PATH}"'
MARKER="# ontology-cli PATH — added by bootstrap-vault.sh"

if ! grep -qF "$MARKER" "$ZPROFILE" 2>/dev/null; then
  {
    echo ""
    echo "$MARKER"
    echo "$PATH_EXPORT"
  } >> "$ZPROFILE"
  echo "    appended PATH export to $ZPROFILE"
else
  echo "    PATH export already present in $ZPROFILE — skipped"
fi

# ---------------------------------------------------------------------------
# 17. Git init + .gitignore + initial commit
# ---------------------------------------------------------------------------
if [[ ! -d "${VAULT_PATH}/.git" ]]; then
  git -C "${VAULT_PATH}" init -q

  # .gitignore
  write_if_absent "${VAULT_PATH}/.gitignore" '.obsidian/workspace.json
.obsidian/workspaces.json
.DS_Store
'

  git -C "${VAULT_PATH}" add .
  git -C "${VAULT_PATH}" commit -q -m "chore: bootstrap vault '${VAULT_NAME}' via bootstrap-vault.sh"
  echo "    git: initialized and committed"
else
  echo "    git: already initialized — skipped"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "==> Vault '${VAULT_NAME}' ready at '${VAULT_PATH}'"
echo "    Next: open vault in Obsidian and complete STORY-002 manual setup."
