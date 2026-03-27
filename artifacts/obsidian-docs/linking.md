# Linking Notes and Files

---

## Link formats

Obsidian supports two interchangeable formats:

| Format   | Syntax                        |
| -------- | ----------------------------- |
| Wikilink | `[[Note Name]]`               |
| Markdown | `[Note Name](Note%20Name.md)` |

Switch to Markdown links at **Settings → Files and Links → Use [[Wikilinks]]** (off). Typing `[[` still triggers autocomplete in both modes.

> [!note]
> In Markdown format, URL-encode the destination path (spaces become `%20`). Avoid these characters in filenames: `# | ^ : %% [[ ]]`.

---

## Link targets

```markdown
[[Three laws of motion]] ← link to a note
[[About Obsidian#Links]] ← link to a heading
[[#Preview a linked file]] ← link to heading in current note
[[2023-01-01#^37066d]] ← link to a block
[[## team]] ← search all headings vault-wide
```

---

## Display text

**Wikilink**:

```markdown
[[Example|Custom label]]
[[Example#Details|Section label]]
```

**Markdown**:

```markdown
[Custom label](Example.md)
```

---

## Block references

Add a block identifier at the end of any paragraph:

```markdown
This is a paragraph. ^my-block-id
```

For structured blocks (lists, blockquotes), place the ID on its own line with blank lines around it:

```markdown
> A blockquote.

^my-quote-id
```

Block identifiers use only Latin letters, numbers, and dashes. Type `[[Note#^` to browse available blocks via autocomplete.

> [!note]
> Block references are Obsidian-specific and will not resolve outside Obsidian.

---

## Aliases

Aliases are reusable alternative names for a note, defined in frontmatter:

```yaml
---
aliases:
  - AI
  - Artificial Intelligence
---
```

Link via alias — Obsidian autocomplete shows aliases with a ↩ icon and generates `[[Actual Note|Alias]]` format. The **Backlinks** plugin surfaces unlinked mentions of aliases, which can be converted to formal links.

---

## Embedding files

Prefix any wikilink with `!` to embed its content inline:

```markdown
![[Note Name]] embed entire note
![[Note Name#Heading]] embed a section
![[Note Name#^block-id]] embed a block
![[image.png]] embed image
![[image.png|300]] embed image at 300px width
![[image.png|640x480]] embed image at exact dimensions
![[audio.mp3]] embed audio player
![[Document.pdf]] embed PDF viewer
![[Document.pdf#page=3]] embed PDF at specific page
![[Document.pdf#height=400]] embed PDF with fixed height
```

**Embed live search results**:

````markdown
```query
tag:#project
```
````

---

## Key link settings

All under **Settings → Files and Links**:

| Setting                              | Description                                   |
| ------------------------------------ | --------------------------------------------- |
| Use [[Wikilinks]]                    | Toggle link format                            |
| Automatically update internal links  | Auto-update links on file rename              |
| New link format                      | Shortest path / relative path / absolute path |
| Default location for new attachments | Where dragged/pasted files are stored         |
| Excluded files                       | Glob patterns deprioritized in autocomplete   |
