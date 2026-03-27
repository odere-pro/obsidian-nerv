---
title: 'Integrate defuddle for web-to-Markdown ingestion and token optimization'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 5
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-040'
phase: 7
sequence: 7
parallelTrack: C
size: 'M — ~0.5 day'
dependsOn:
  - STORY-031
blocks: []
decisionGate: ~
validationBasis: 'bun test src/commands/__tests__/web-ingest.test.ts passes; defuddle parse executes successfully on test URLs without error; bun test tests/integration/web-ingest/ passes with network access'
---

## Goal

Create a new command module `web-ingest` that wraps `defuddle parse` for extracting clean Markdown from web URLs and importing them into the vault.
Enable the study agent and research workflows to ingest external knowledge sources (documentation, articles, blog posts) into project notes with automatic frontmatter, link resolution, and token-optimized content.
Defuddle strips navigation clutter and reduces token usage vs. raw HTML fetching, making it ideal for knowledge base construction.

## Acceptance criteria

### web-ingest:add

- [ ] `src/commands/web-ingest/add.ts` exports `Command` and `ingestUrl(url: string, vault: string, project: string, parent?: string): Promise<IngestResult>` (programmatic API)
- [ ] Validates URL format (must start with `http://` or `https://`); exits 1 with error on invalid URL
- [ ] Calls `defuddle parse <url> --json` via `spawnCapture` to fetch and extract content
- [ ] Parses defuddle JSON output: extracts `title`, `description`, `content` fields
- [ ] Creates a new LEAF note in `projects/<slug>/` using `createEntity()` from STORY-033 with: `kind: "web-source"`, `spine: "external"`, frontmatter fields `url`, `source_title`, `source_date`
- [ ] Note title is derived from defuddle `title` field; slug is generated from URL domain + path hash (deterministic, URL-safe)
- [ ] Note body contains: extracted Markdown content in `## Content` section, source URL and date in `## Metadata` section
- [ ] Appends a Connections entry: `- sources :: <url>` in parent's `## Connections` if parent is specified
- [ ] Logs ingestion to daily note via `dailyAppend()`
- [ ] `--json` flag emits schema: `{"ingested": boolean, "path": "...", "title": "...", "url": "...", "wordCount": N, "tokenEstimate": N}`
- [ ] Idempotent: if note for this URL already exists (checked via `url:` frontmatter match), exits 0 with no modification
- [ ] On network error (unreachable URL, defuddle timeout), exits 1 with descriptive error; does not create partial notes

### web-ingest:batch

- [ ] `src/commands/web-ingest/batch.ts` reads a JSON file with URL array: `{"urls": ["https://...", "https://...", ...], "parent": "parent-slug" (optional)}`
- [ ] Iterates array, calls `ingestUrl()` for each URL
- [ ] Skips URLs that produce errors; continues with remaining URLs
- [ ] Reports summary: `{"ingested": N, "skipped": M, "failed": K, "totalTokens": N}`
- [ ] All ingested notes are children of `parent` if specified

### web-ingest:monitor

- [ ] `src/commands/web-ingest/monitor.ts` accepts a feed URL (RSS/Atom) and polls for new articles
- [ ] `--interval 3600` (seconds, default 1 hour) specifies polling interval
- [ ] For each new article, calls `ingestUrl()` to create a note
- [ ] Stores last-checked timestamp in `_inbox/_web-ingest-state.json`; skips articles older than last-checked
- [ ] Runs in a daemon loop; exit via `Ctrl+C` or timeout
- [ ] Optional feature: can be invoked by morning.ts (STORY-036) with `--once` flag to check feeds once during morning ritual

### Tests

- [ ] `src/commands/__tests__/web-ingest/add.test.ts`: mocks `spawnCapture` (defuddle calls); tests URL validation (valid, invalid, malformed); tests idempotency (URL seen twice); tests JSON output schema; at least 5 assertions
- [ ] `src/commands/__tests__/web-ingest/batch.test.ts`: mocks `ingestUrl()`; tests array iteration, error recovery, summary counts; at least 3 assertions
- [ ] `src/commands/__tests__/web-ingest/monitor.test.ts`: tests state file updates, article filtering (new vs. cached), interval timing; at least 3 assertions
- [ ] `tests/integration/web-ingest/add.integration.test.ts`: real network call to a stable test URL (e.g., Wikipedia stub, https://example.com); verifies note created, frontmatter fields populated, body contains extractedcontent; requires network access
- [ ] `bun test src/commands/__tests__/web-ingest/` exits 0 without network

## Additional information

Defuddle is the preferred way to ingest web content into Obsidian.
It removes ads, navigation, footers, and other clutter — producing cleaner Markdown and significantly reducing token usage vs. raw HTML scraping.
The `defuddle parse` command outputs JSON with `title`, `description`, `content`, and metadata; this JSON is the stable contract.

> [!important]
> URL idempotency is critical: store the original URL in the note's `url:` frontmatter field.
> Before calling `defuddle parse`, check if any note in the project already has this URL in its frontmatter.
> If found, skip the ingest and return the existing note path (no modification, exit 0).
> This prevents duplicate ingestion on re-runs and lets you safely re-run batch ingestion scripts.

> [!note]
> Defuddle requires a network connection and may take 2–5 seconds per URL.
> For large batches, consider serial processing (one at a time) to avoid resource exhaustion.
> Cache results aggressively — store the extracted JSON in a `.cache/` directory alongside notes for offline reference.

## System design

- [PLAN.md — Story 040](../PLAN.md)
- [obsidian-skill-documentation.md — defuddle skill reference](../obsidian-skill-documentation.md#defuddle-skill)
- [Defuddle GitHub](https://github.com/lucaong/defuddle): open-source Markdown extraction tool
- [STORY-033 — createEntity module for programmatic note creation](STORY-033.md)
- [STORY-036 — morning.ts could invoke monitor with --once](STORY-036.md)

## Resources

- [Defuddle CLI documentation](https://github.com/lucaong/defuddle): `defuddle parse <url> --json` command reference; JSON schema documentation
- [Bun.spawn for subprocess management](https://bun.sh/docs/api/spawn): spawn defuddle as a subprocess with timeout (30 seconds recommended for slow network conditions)
- [RSS/Atom parsing in TypeScript](https://github.com/feedparser/feedparser): use `rss-parser` package from npm for feed polling in monitor mode
- [Frontmatter URL field convention](https://help.obsidian.md/Editing+and+formatting/Properties): store URLs in YAML as `url: "https://..."` for reliable lookups

## Recommendations

- Extract `src/lib/defuddle.ts` as a shared utility: `async fetchAndParse(url): Promise<DefuddleOutput>`, `cacheFile(url, output)`, `isCached(url)` — enables offline fallback if network is unavailable
- Add a `--no-cache` flag to bypass lookups (force re-fetch even if URL exists)
- For monitor mode, use `node-cron` or similar to schedule polling at regular intervals instead of a blocking loop — allows graceful shutdown
- Consider a `web-ingest:cite` convenience command that creates a bibliographic note from defuddle metadata (`title`, `author`, `date`, `source`) formatted as a BibTeX entry

## Security considerations

| Area               | Risk                                                 | Mitigation                                                                                                        |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| URL injection      | Caller passes untrusted URL to defuddle              | Validate URL format (http/https scheme, no `file://` or `gopher://`); use allowlist of trusted domains if needed  |
| Code injection     | Defuddle output could contain malicious JavaScript   | Treat defuddle JSON content as untrusted; escape any fields before embedding in HTML or template strings          |
| DOS via feed loops | Feed monitor polls malicious feed with 1000+ items   | Implement `--max-articles N` flag (default 10); skip feeds with > 100 items; log suspicious activity              |
| Path traversal     | Slug generation from URL could produce `../` or `//` | Validate slug against `/^[a-z0-9-]+$/` after generation; prepend project slug to ensure path stays within project |
| Network timeout    | Malicious or slow URLs stall ingestion indefinitely  | Hard 30-second timeout on defuddle subprocess; throw `ShellTimeoutError` and skip URL on timeout                  |

---

> **Depends on**:
>
> - STORY-031 — core library (shell utilities, logging) must exist first
