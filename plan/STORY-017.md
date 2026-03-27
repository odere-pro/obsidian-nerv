---
title: 'Implement get-entity.sh sensory skill'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-005 — Sensory Skills: Knowledge Retrieval'
planKey: 'STORY-017'
phase: 4
sequence: 2
parallelTrack: B
size: 'M — ~0.5 day'
dependsOn:
  - STORY-003
  - STORY-006
blocks:
  - STORY-019
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 017 acceptance criteria'
---

## Goal

Author `get-entity.sh` in `~/.ontology-cli/core/` to return full entity detail as structured JSON: all frontmatter fields, all body sections parsed, backlinks from metadata cache, and resolved outgoing links. This sensory skill gives agents precise structural context for a specific entity without requiring a full vault search.

## Acceptance Criteria

- [ ] `get-entity.sh study "TESTPROJ.note-a"` finds the note by basename or partial match and returns: `{"path":"...","frontmatter":{...},"sections":{"Summary":"...","Content":"...","Connections":"..."},"backlinks":[{"path":"...","title":"...","type":"..."}],"outgoing":[{"path":"...","title":"...","display":"..."}]}`
- [ ] Backlinks are retrieved from `app.metadataCache.getBacklinksForFile(f).data` — not from grep
- [ ] Emits a clear error to stderr and exits 1 if no note matches the search term
- [ ] Sections parsed by splitting on `## ` heading boundaries; section content trimmed and truncated to 3000 characters
- [ ] `tests/test-get-entity.sh` passes in the test harness

## Additional Information

Outgoing links resolved via `app.metadataCache.resolveSubpath`. Partial match searches both `file.basename` and `frontmatter.aliases`. The skill gives agents a single-note deep-dive without the overhead of a full vault scan.

> [!important]
> If multiple notes match the partial search term, return an error listing the ambiguous matches and exit 1. Do not silently return the first match — the agent must resolve the ambiguity before proceeding.

## System Design

- [PLAN.md — Story 017](../PLAN.md)
- [obsidian_docs.md — v11 §8 Frontmatter fields, backlinks, outgoing links](../obsidian_docs.md)

## Resources

- [Obsidian `app.metadataCache.getBacklinksForFile(file).data`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getBacklinksForFile): returns `{[filePath: string]: LinkCache[]}` — each `LinkCache` has `.link` (raw wikilink text), `.position` (line/col), `.original` (full markdown); iterate the data map to extract backlink file paths
- [Obsidian `app.metadataCache.resolveSubpath(file, subpath)`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/resolveSubpath): resolves a subpath reference within a file; for plain wikilinks without subpath, use `app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)` instead
- [JavaScript string splitting on heading boundaries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split): `content.split(/\n## /)` splits on h2 boundaries; `[0]` is content before the first heading; filter out frontmatter by stripping the YAML block first

## Recommendations

- Normalize the search term to lowercase and strip the `PREFIX.slug - ` convention prefix when doing partial matches against `file.basename` — users often search by the semantic slug, not the full file name
- Include a `"matchType"` field in the JSON output (`"exact"` vs `"partial"`) so the calling agent knows whether the result is unambiguous
- Return backlink frontmatter fields (`type`, `kind`, `spine`) to give the agent context about what kind of note is linking back

---

> **Blocks**:
>
> - STORY-019 ⛔ — Implement knowledge gap and topic explanation skills (get-entity.sh used for detail assembly in explain-topic.sh)
