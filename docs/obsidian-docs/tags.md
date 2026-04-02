# Tags

Tags are keywords that categorize notes independently of folder structure.

---

## Create tags

**Inline**:

```markdown
#meeting #project/alpha
```

**Frontmatter**:

```yaml
---
tags:
  - meeting
  - project/alpha
---
```

---

## Tag naming rules

- Use alphanumeric characters, `_`, `-`, and `/`.
- Include at least one non-numeric character (`#123` alone is invalid).
- Tags are case-insensitive.

---

## Nested tags

Use `/` to create hierarchical taxonomies:

```text
#project/alpha
#project/beta
#recipe/dinner/italian
```

Searching `#project` returns notes tagged with `#project/alpha` and `#project/beta`.

---

## Find and browse tags

| Method      | How                                     |
| ----------- | --------------------------------------- |
| Search pane | `tag:#tagname`                          |
| Tags view   | Enable in **Settings → Core Plugins**   |
| Graph view  | Filter and group nodes by tag           |
| Bases       | Use `file.hasTag("tagname")` in filters |

---

## Tags vs. links

Use **tags** for shared attributes (note type, status, broad category).
Use **links** for direct relationships between specific notes.
