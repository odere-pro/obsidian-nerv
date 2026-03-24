---
title: 'Implement context.sh primary sensory skill'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 8
epic: 'EPIC-005 — Sensory Skills: Knowledge Retrieval'
planKey: 'STORY-016'
phase: 4
sequence: 1
parallelTrack: A
size: 'XL — ~2 days'
dependsOn:
  - STORY-003
blocks:
  - STORY-019
  - STORY-020
  - STORY-022
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 016 acceptance criteria'
---

## Goal

Author `context.sh` in `~/.ontology-cli/core/` as the primary AI interface for vault retrieval — it scores all project notes by relevance to a natural language query using a weighted multi-factor scoring model and returns the top N results with full structural context as JSON. This is the most critical sensory nerve: the Researcher subagent invokes it before answering any knowledge question.

## Acceptance Criteria

- [ ] Scoring weights applied per result: title match +10, alias match +8, kind match +5, spine match +4, body term frequency +1 per occurrence (capped at +5 total), tag match +3
- [ ] Returns JSON: `{"query":"...","vault":"...","results":[{"path":"...","title":"...","type":"...","kind":"...","spine":"...","status":"...","parent":"...","children":[...],"aliases":[...],"breadcrumb":"...","summary":"<## Summary text>","content":"<## Content truncated to 2000 chars>","connections":[{"rel":"...","target":"...","context":"..."}]}]}`
- [ ] Default limit is 5 results; configurable: `context.sh study "S3 lifecycle" 3`
- [ ] Runtime < 5 seconds for a 200-note vault
- [ ] Returns `{"results":[]}` with exit 0 when no notes match — never exits non-zero for empty results
- [ ] Accepts `vault=` parameter
- [ ] The `breadcrumb` field is reconstructed by traversing `parent` frontmatter links up to ROOT, capped at 5 hops
- [ ] `tests/test-context.sh` passes in the test harness

## Additional Information

Implements scoring via `obsidian eval` JavaScript: iterate `app.vault.getMarkdownFiles()`, for each file retrieve frontmatter via `app.metadataCache.getFileCache(f)?.frontmatter` and body via `app.vault.cachedRead(f)`, compute score, sort descending, slice to limit. Content is truncated to 2000 characters to prevent context window overflow in agent responses.

> [!important]
> `context.sh` is the vault-first retrieval gate. The CLAUDE.md rule that calls it must appear FIRST so it executes before any Writer or Linker rules on every agent turn. Performance is critical — a slow `context.sh` degrades every Researcher response.

## System Design

- [PLAN.md — Story 016](../PLAN.md)
- [obsidian_docs.md — v11 §22 Decomposition flow, Researcher subagent pattern](../obsidian_docs.md)

## Resources

- [Obsidian `app.vault.getMarkdownFiles()`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/getMarkdownFiles): returns all markdown files; for a 200-note vault this completes in milliseconds; scoring can be done in a single JavaScript closure without multiple `eval` calls
- [JavaScript `String.prototype.split().length` for term frequency](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split): `(body.toLowerCase().match(new RegExp(term, 'gi')) || []).length` counts occurrences; tokenize the query string by spaces and score each token independently
- [Obsidian `app.metadataCache.getFileCache(f)?.frontmatter?.aliases`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache): aliases may be a string or array in frontmatter depending on how the user wrote them; normalize to array with `[].concat(aliases || [])` before comparison

## Recommendations

- Implement the entire scoring loop in a single `obsidian eval` JavaScript IIFE that returns the JSON result — this eliminates per-file `eval` overhead and keeps runtime well under 5 seconds
- Normalize query terms to lowercase and strip punctuation before scoring to improve recall (e.g., "S3's lifecycle" should match "s3 lifecycle")
- The breadcrumb traversal must detect cycles (a parent pointing to itself) — cap at 5 hops and append `[cycle detected]` if a path repeats

## Security Considerations

| Area             | Risk                                                                                        | Mitigation                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Prompt injection | Vault note content returned as part of JSON could contain strings that manipulate the agent | Content is truncated to 2000 chars and returned as a JSON string value — the agent layer must treat it as data, not instructions |
| Shell injection  | Query string passed to `obsidian eval` JavaScript expression                                | JSON-encode the query string with `python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$QUERY"` before interpolation   |

---

> **Blocks**:
>
> - STORY-019 ⛔ — Implement knowledge gap and topic explanation skills (explain-topic.sh uses context.sh for topic location)
> - STORY-020 ⛔ — Author CLAUDE.md agent configs (CLAUDE.md rule references context.sh)
> - STORY-022 ⛔ — Implement study-specific skills (quiz.sh and Quizmaster pattern depend on context.sh)
