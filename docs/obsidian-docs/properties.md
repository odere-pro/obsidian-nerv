# Properties

**Properties** (frontmatter) store structured, typed metadata in YAML at the top of a file.

```yaml
---
title: My Note
date: 2025-04-15
tags:
  - meeting
  - project
aliases:
  - Alternate Name
cssclasses:
  - wide-page
---
```

---

## Add properties

| Method            | Action                                       |
| ----------------- | -------------------------------------------- |
| Command Palette   | "Add file property"                          |
| Keyboard shortcut | `Cmd+;`                                      |
| More actions menu | Click the three-dot menu on a tab            |
| Manual            | Type `---` at the very beginning of the file |

---

## Property types

A property name's type is **vault-wide** — all notes sharing a name use the same type.

| Type        | Description                     | Example                        |
| ----------- | ------------------------------- | ------------------------------ |
| Text        | Single-line string              | `status: draft`                |
| List        | Multiple values                 | `tags:\n  - one\n  - two`      |
| Number      | Integer or decimal              | `rating: 4.5`                  |
| Checkbox    | Boolean                         | `completed: true`              |
| Date        | ISO 8601                        | `date: 2025-04-15`             |
| Date & Time | Date with time                  | `created: 2025-04-15T14:30:00` |
| Tags        | Special type for the `tags` key | `tags:\n  - meeting`           |

---

## Built-in properties

| Property      | Type     | Purpose                                           |
| ------------- | -------- | ------------------------------------------------- |
| `tags`        | Tags     | Note categorization; equivalent to inline `#tags` |
| `aliases`     | List     | Alternative names for link suggestions and search |
| `cssclasses`  | List     | CSS class names applied to the note               |
| `publish`     | Checkbox | Obsidian Publish: whether the note is published   |
| `permalink`   | Text     | Obsidian Publish: custom URL path                 |
| `description` | Text     | Obsidian Publish: meta description                |

> [!note]
> `tag`, `alias`, and `cssclass` are deprecated since Obsidian 1.4. Use the plural forms above instead. The Format Converter plugin can bulk-convert deprecated properties.

---

## Display modes

Configure via **Settings → Editor → Properties in document**:

| Mode    | Behavior                                              |
| ------- | ----------------------------------------------------- |
| Visible | Formatted UI at top of note (default)                 |
| Hidden  | Hidden in editor; accessible via Properties view pane |
| Source  | Raw YAML frontmatter displayed as text                |

---

## Property navigation hotkeys

| Action                  | Hotkey               |
| ----------------------- | -------------------- |
| Focus next property     | `↓` or `Tab`         |
| Focus previous property | `↑` or `Shift+Tab`   |
| Jump to editor          | `Alt+↓`              |
| Edit property name      | `←`                  |
| Edit property value     | `→`                  |
| Focus property          | `Esc` (from editing) |
| Delete property         | `Cmd+Backspace`      |
| Select all              | `Cmd+A`              |

---

## Search by property

```text
[property:value]
[status:completed]
[tags:meeting]
```

---

## Properties view plugin

The **Properties view** core plugin provides vault-wide property management. Right-click any property in the All Properties panel to rename it globally or change its type. Renaming propagates to every note in the vault.
