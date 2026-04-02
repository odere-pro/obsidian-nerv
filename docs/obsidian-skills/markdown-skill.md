# Obsidian Markdown Skill

**Skill name:** `obsidian-markdown` · **File extension:** `.md`

Enables AI agents to create and edit Obsidian Flavored Markdown files. Obsidian Flavored Markdown is a superset combining CommonMark, GitHub Flavored Markdown (GFM), LaTeX, and Obsidian-specific extensions.

**Activate when:** working with `.md` files, or when the user mentions wikilinks, callouts, embeds, frontmatter, tags, or properties.

---

## Feature Categories

| Category        | Features                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base formatting | Paragraphs, headings, bold, italic, lists, quotes, code blocks, tables                                                                                                    |
| Linking         | Standard links, `[[wikilinks]]`, heading links `[[Note#Heading]]`, block links `[[Note#^block-id]]`                                                                       |
| Embedding       | Notes, sections, images, PDFs via `![[filename]]` transclusion                                                                                                            |
| Callouts        | 13+ built-in types (`note`, `tip`, `warning`, `info`, `example`, `quote`, `bug`, `danger`, `success`, `failure`, `question`, `abstract`, `todo`), foldable, custom titles |
| Metadata        | YAML frontmatter properties, inline `#tags`                                                                                                                               |
| Math            | Inline `$...$` and block `$$...$$` via LaTeX                                                                                                                              |
| Diagrams        | Flowcharts and sequence diagrams via Mermaid code blocks                                                                                                                  |
| Advanced        | Footnotes `[^1]`, hidden comments `%%...%%`, highlighting `==text==`, block IDs `^block-id`                                                                               |

---

## Key Syntax Examples

```markdown
---
title: 'My Note'
date: 2026-03-25
tags: [project, active]
status: in-progress
---

# My Note

Link to another note: [[Related Note]]
Link to a section: [[Related Note#Summary]]

![[image.png|300]]
![[document.pdf#page=2]]

> [!warning] Watch out
> This is a foldable warning callout.

$$E = mc^2$$
```
