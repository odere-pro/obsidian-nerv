---
title: 'Implement sync-vocab.sh autonomic skill'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-004 — Autonomic Skills: Sync and Review'
planKey: 'STORY-012'
phase: 3
sequence: 4
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-003
  - STORY-009
blocks:
  - STORY-015
  - STORY-024
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 012 acceptance criteria'
---

## Goal

Author `sync-vocab.sh` in `~/.ontology-cli/core/` to rebuild a project's `_vocab.[project].md` from note metadata, detecting spine overflow and orphan terms. This autonomic skill fires during the weekly review cycle to keep the vocabulary index current with vault content.

## Acceptance Criteria

- [ ] `sync-vocab.sh study aws` rebuilds `_vocab.aws.md` with a vocabulary tree grouped by spine (L0–L3), flags BRANCH children > 7 and LEAF children > 5 as overflows, lists notes without spine under `## Orphan Terms`, and updates the `updated:` frontmatter date
- [ ] Re-running produces no additional entries or duplicate rows (idempotent)
- [ ] Accepts `vault=` parameter; exits 0 on success, 1 on error
- [ ] `tests/test-sync-vocab.sh` passes in the test harness

## Additional Information

Reads `type`, `spine`, `children` from all project notes via `obsidian eval`. BRANCH children > 7 and LEAF children > 5 thresholds are defined in the project's `_topk` limits table. STORY-024 (`migrate.sh`) calls `sync-vocab.sh` after `rename-spine` operations to keep the vocabulary index consistent.

> [!important]
> `sync-vocab.sh` overwrites `_vocab.[project].md` entirely on each run — do not append to the file. The vocabulary tree must be fully regenerated from current vault state to avoid stale entries after note deletions.

## System Design

- [PLAN.md — Story 012](../PLAN.md)
- [obsidian_docs.md — v11 `_vocab` structure, spine hierarchy L0–L3, overflow thresholds](../obsidian_docs.md)

## Resources

- [Obsidian `app.vault.getMarkdownFiles()`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/getMarkdownFiles): returns all markdown files in the vault as `TFile[]`; filter by `file.path.startsWith('projects/' + slug + '/')` to scope to a single project
- [`app.metadataCache.getFileCache(file)?.frontmatter`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache): access `frontmatter.spine` and `frontmatter.children` for each note; `children` may be `undefined` for LEAF notes — treat as empty array
- [YAML frontmatter update via `processFrontMatter`](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter): update `updated: YYYY-MM-DD` using today's date; use `new Date().toISOString().split('T')[0]` in the JavaScript expression

## Recommendations

- Sort notes by spine then by type (ROOT → BRANCH → LEAF) before building the vocabulary tree to ensure consistent output order across runs
- Read overflow thresholds from the project's `_topk` frontmatter rather than hardcoding — this allows per-project customization
- Add a dry-run flag (`--dry-run`) that prints the would-be vocabulary tree without writing the file — useful for debugging sync outputs

---

> **Blocks**:
>
> - STORY-015 ⛔ — Implement weekly-review.sh (sync-vocab is part of the review sequence)
> - STORY-024 ⛔ — Implement migrate.sh (rename-spine calls sync-vocab to update the vocabulary index)
