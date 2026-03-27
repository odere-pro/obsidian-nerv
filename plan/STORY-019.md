---
title: 'Implement get-knowledge-gap.sh and explain-topic.sh sensory skills'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-005 — Sensory Skills: Knowledge Retrieval'
planKey: 'STORY-019'
phase: 4
sequence: 4
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-016
  - STORY-017
blocks:
  - STORY-021
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 019 acceptance criteria'
---

## Goal

Author `get-knowledge-gap.sh` to identify structural deficiencies across a project (stubs, isolated nodes, drafts, missing fields, low link count, unresolved links), and `explain-topic.sh` to assemble a teaching bundle for a queried topic (primary note, parent, siblings, and connected notes' summaries). These sensory skills enable the Researcher subagent to surface vault gaps and assemble full teaching context.

## Acceptance Criteria

- [ ] `get-knowledge-gap.sh study aws` returns JSON: `{"stubs":[{"note":"...","words":N}],"noConnections":[...],"drafts":[{"note":"...","kind":"...","spine":"..."}],"missingFields":[{"note":"...","missing":["kind","spine"]}],"lowLinkCount":[{"note":"...","links":N}],"unresolvedLinks":[{"note":"...","broken":["[[BadRef]]"]}]}`
- [ ] Stubs defined as notes with body word count < 100 (excluding frontmatter); low link count defined as ROOT or BRANCH with < 2 outgoing links
- [ ] `explain-topic.sh study "S3 lifecycle"` returns: `{"primary":{<full entity>},"parent":{"title":"...","summary":"..."},"siblings":[{"title":"...","summary":"..."}],"connected":[{"title":"...","summary":"...","kind":"...","rel":"..."}]}`
- [ ] `explain-topic.sh` locates the note via `context.sh` (highest-scoring match), then assembles parent/sibling/connected context using `app.metadataCache`
- [ ] Siblings are all notes whose `parent` field matches the primary note's `parent`
- [ ] When the primary note is ROOT (no parent), `parent` is set to `null` in the output
- [ ] `tests/test-knowledge-gap.sh` and `tests/test-explain-topic.sh` pass in the test harness

## Additional Information

Word count computed by reading body text (excluding frontmatter) and splitting on whitespace. Unresolved links detected by checking each wikilink against `app.metadataCache.getFirstLinkpathDest` — null result indicates a broken link. `explain-topic.sh` composes `context.sh` and `get-entity.sh` — it does not reimplement retrieval logic.

> [!important]
> `explain-topic.sh` must call `context.sh` as a subprocess (not reimplement scoring) and call `get-entity.sh` for the primary note detail. This ensures both skills stay in sync as retrieval logic evolves.

## System Design

- [PLAN.md — Story 019](../PLAN.md)
- [obsidian_docs.md — v11 §19 Knowledge gap analysis, teaching bundle pattern](../obsidian_docs.md)

## Resources

- [Obsidian `app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFirstLinkpathDest): returns `TFile | null`; null means the wikilink is unresolved (broken); extract all wikilinks from note body using `/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g`
- [JavaScript word count from body text](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split): strip the YAML frontmatter block (`/^---[\s\S]*?---\n/`) from the content string before word count; `body.trim().split(/\s+/).filter(Boolean).length`
- [Sibling detection via parent lookup](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache): for all project files, filter those whose `frontmatter.parent` wikilink resolves to the same file as the primary note's parent; exclude the primary note itself from the sibling list

## Recommendations

- `get-knowledge-gap.sh` should be fast (< 3 seconds) since it may be called during interactive sessions — run all gap checks in a single `obsidian eval` JavaScript pass
- `explain-topic.sh` should truncate sibling and connected note summaries to 500 characters to control response size when there are many siblings
- The `explain-topic.sh` output is consumed directly by the Researcher subagent — ensure the `"instruction"` style summary is agent-friendly (no nested quotes that would break JSON parsing)

---

> **Blocks**:
>
> - STORY-021 ⛔ — Implement agent subagent patterns (Researcher pattern uses explain-topic.sh and get-knowledge-gap.sh)
