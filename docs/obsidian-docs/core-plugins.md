# Core Plugins

Enable and configure core plugins at **Settings → Core plugins**.

---

## Tier 1 — Essential

### Bases

Database-like views of vault notes stored as `.base` files. See [bases.md](bases.md) for full documentation.

### Graph view

Visualizes the vault as a node-and-edge graph. Open the **Global Graph** with **Command Palette → Open graph view**. Open the **Local Graph** (neighbors of the active note) with **Command Palette → Open local graph** — pin it in the right sidebar.

**Graph configuration**:

- **Groups** — color-code nodes by search query (e.g., `path:Entities/People` → blue).
- **Filters** — toggle tags, attachments, orphaned notes.
- **Forces** — tune repel strength, link distance for readability.
- **Depth** (Local Graph) — set to 1, 2, or 3 hops.

> [!tip]
> The Global Graph becomes noisy above ~1000 notes. Use the Local Graph for daily navigation and the Global Graph for periodic structural review.

### Properties view

Provides **File Properties** (active note) and **All Properties** (vault-wide) sidebar panels. Right-click any property in All Properties to rename it vault-wide or change its type.

### Tags view

Displays all tags hierarchically with note counts. Click any tag to open Search filtered to that tag.

**Nested tag taxonomy pattern**:

```text
#entity
  #entity/person
    #entity/person/philosopher
    #entity/person/scientist
  #entity/concept
  #entity/event
```

### Backlinks

Shows all notes that link to the active note. Displays both **Linked mentions** (formal `[[links]]`) and **Unlinked mentions** (plain text occurrences). Use **Unlinked mentions** to discover implicit relationships and convert them to formal links.

### Templates

Inserts predefined note structures from a configured template folder.

Configure at **Settings → Core plugins → Templates**:

- Set the **Template folder location** (e.g., `_Templates/`).
- Set default date and time formats.

Insert a template via **Command Palette → Insert template**.

**Available tokens**:

| Token       | Resolves to                        |
| ----------- | ---------------------------------- |
| `{{title}}` | The note's filename                |
| `{{date}}`  | Current date (configurable format) |
| `{{time}}`  | Current time (configurable format) |

**Example person template**:

```yaml
---
type: person
name: '{{title}}'
birthDate:
domain: []
tags:
  - entity/person
created: '{{date}}'
---
## Overview

## Key contributions

## Relationships

## Notes
```

---

## Tier 2 — Supporting

### Search

Full-text and property-based search across the vault. Open with `Cmd+Shift+F` or the magnifying glass icon.

**Search operators**:

| Operator     | Example                      | Description                |
| ------------ | ---------------------------- | -------------------------- |
| `path:`      | `path:Entities/People`       | Restrict to folder         |
| `file:`      | `file:Aristotle`             | Match filename             |
| `tag:`       | `tag:#entity/person`         | Match tag                  |
| `[prop:val]` | `[status:completed]`         | Match frontmatter property |
| `line:`      | `line:(teacher AND Plato)`   | Match within same line     |
| `section:`   | `section:(## Relationships)` | Match within a section     |
| `-`          | `-path:_Templates`           | Exclude                    |
| `/regex/`    | `/birth.*\d{4}/`             | Regex pattern              |

**Embedded search in notes**:

````markdown
```query
tag:#entity/person/philosopher
```
````

### Note composer

**Extract** selected text into a new note (auto-link replaces selection). **Merge** another note into the current file. Use via **Command Palette → Extract current selection** or right-click selected text.

### Outline

Shows a hierarchical header tree for the active note in the right sidebar. Click to jump to a section; drag to reorder.

### Bookmarks

Bookmark notes, folders, headers, search queries, and graph views for quick access. Organize bookmarks into named groups. Bookmarkable items include saved search queries — Obsidian's equivalent of stored procedures.

### Outgoing links

Shows all notes the active note links _to_, plus unlinked mentions — the complement of Backlinks.

---

## Tier 3 — Utility

### Daily notes

Creates a date-stamped note each day from a template.

Configure at **Settings → Core plugins → Daily notes**:

- **Date format**: `YYYY-MM-DD` (recommended)
- **New file location**: `Journals/Daily/`
- **Template file**: `_Templates/DailyNote.md`

### Word count

Displays word and character count in the status bar. Select text to count only the selection.

### Workspaces

Saves and restores complete application layouts (open tabs, sidebar states). Save/load via **Command Palette → Manage workspaces**.

**Recommended workspaces**:

| Workspace name | Layout                                                      |
| -------------- | ----------------------------------------------------------- |
| `editing`      | File Explorer · Active note · Local Graph + Backlinks       |
| `review`       | Tags View + Bookmarks · Schema note + Base · All Properties |
| `explore`      | Search · Global Graph · Outline                             |

### File recovery

Saves periodic note snapshots. Configure the snapshot interval and history length at **Settings → Core plugins → File recovery**. Access snapshots via **Command Palette → Show file recovery**.

> [!warning]
> File Recovery operates per-note and per-device. Use an additional backup strategy (Git, Time Machine) for vault-wide protection.
