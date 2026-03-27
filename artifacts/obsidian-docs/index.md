# Obsidian Complete Reference

Comprehensive reference for all core Obsidian features: vaults, formatting, linking, properties, Bases, plugins, and the macOS CLI.

---

## Sections

| Section                                   | Summary                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| [Vaults](vaults.md)                       | Create, sync, back up, and import into vaults                                    |
| [Files and folders](files-and-folders.md) | Accepted formats, configuration folder, note management                          |
| [Editing and formatting](formatting.md)   | OFM syntax: text, headings, lists, tables, callouts, math, diagrams              |
| [Properties](properties.md)               | Frontmatter types, built-in keys, search, display modes                          |
| [Tags](tags.md)                           | Inline and frontmatter tags, nested hierarchies, browsing                        |
| [Linking](linking.md)                     | Wikilinks, markdown links, block references, aliases, embedding                  |
| [Bases](bases.md)                         | Database views of vault notes: filters, formulas, functions, summaries, examples |
| [Core plugins](core-plugins.md)           | Graph view, search, templates, daily notes, workspaces, and more                 |
| [Obsidian CLI](cli.md)                    | macOS CLI: installation, commands, automation examples                           |

---

## Quick reference

### Keyboard shortcuts (macOS)

| Action               | Shortcut      |
| -------------------- | ------------- |
| New note             | `Cmd+N`       |
| Open command palette | `Cmd+P`       |
| Open settings        | `Cmd+,`       |
| Bold                 | `Cmd+B`       |
| Italic               | `Cmd+I`       |
| Add property         | `Cmd+;`       |
| Search vault         | `Cmd+Shift+F` |
| Rename note          | `F2`          |
| Show hidden files    | `Cmd+Shift+.` |

### Formatting cheat sheet

```markdown
**bold** _italic_ ~~strikethrough~~ ==highlight== `code`

[[Note]] internal link
[[Note|Alias]] link with display text
[[Note#Heading]] link to heading
[[Note#^block-id]] link to block
![[Note]] embed note
![[image.png|300]] embed image at 300px

> [!note]
> Callout block

#tag #nested/tag

^block-id

--- horizontal rule
```

### Properties cheat sheet

```yaml
---
tags:
  - tag1
  - tag2
aliases:
  - alternate-name
cssclasses:
  - custom-class
date: 2025-04-15
completed: true
rating: 4.5
related: '[[Other Note]]'
---
```

### Bases filter cheat sheet

```yaml
# Tag
filters: 'file.hasTag("meeting")'

# Folder
filters: 'file.inFolder("Projects")'

# Property comparison
filters: 'status == "done"'
filters: 'priority > 3'
filters: 'file.mtime > now() - "1 week"'

# Compound
filters:
  and:
    - file.inFolder("Projects")
    - 'status != "cancelled"'
  or:
    - file.hasTag("urgent")
    - 'priority >= 4'

# Regex
filters: '/^\d{4}-\d{2}-\d{2}$/.matches(file.name)'
```
