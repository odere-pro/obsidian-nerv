# Defuddle Skill

**Skill name:** `defuddle`

Extracts clean, readable Markdown from web pages by removing navigation, ads, footers, and other clutter. Preferred over raw WebFetch when processing human-readable content — significantly reduces token usage.

**Activate when:** the user provides a URL and asks for its content to be read, summarized, or saved.

In `obsidian-nerv`, Defuddle is used by the `nerv web-ingest:*` commands:

| Command                   | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `nerv web-ingest:add`     | Parse a URL with Defuddle and save as a `web-source` note            |
| `nerv web-ingest:batch`   | Process multiple URLs from a file                                    |
| `nerv web-ingest:monitor` | Poll RSS/Atom feeds; state stored in `_inbox/_web-ingest-state.json` |

URL idempotency is enforced via `url:` frontmatter — re-ingesting an existing URL updates the note rather than creating a duplicate.

---

## Core command

```bash
defuddle parse <url> --md
```

## Output formats

| Flag            | Output                                                |
| --------------- | ----------------------------------------------------- |
| `--md`          | Clean Markdown                                        |
| `--json`        | Structured JSON with metadata                         |
| `-p title`      | Specific property only (e.g., `title`, `description`) |
| `-o content.md` | Save output to file                                   |

## Examples

```bash
# Parse to Markdown
defuddle parse https://example.com/article --md

# Save to file
defuddle parse https://example.com/article --md -o notes/article.md

# Extract just the title
defuddle parse https://example.com/article -p title

# Get structured JSON
defuddle parse https://example.com/article --json
```

## Defuddle vs. WebFetch

| Tool             | When to use                                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| `defuddle parse` | Human-readable articles, blog posts, documentation — strips clutter, optimizes tokens |
| `WebFetch`       | Raw HTML debugging, scraping data that Defuddle might filter out                      |

## Installation

```bash
npm install -g defuddle
```
