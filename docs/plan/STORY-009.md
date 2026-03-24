---
title: 'Implement cli-lint.sh reflex skill'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 5
epic: 'EPIC-003 — Reflex Skills: Automated Auditing'
planKey: 'STORY-009'
phase: 3
sequence: 1
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-003
  - STORY-006
blocks:
  - STORY-012
  - STORY-013
  - STORY-015
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 009 acceptance criteria'
---

## Goal

Author `cli-lint.sh` in `~/.ontology-cli/core/` using `obsidian eval` and `app.metadataCache` to validate frontmatter completeness, type-specific structural rules, callout flag limits, connection typing, breadcrumb presence, and legacy tag usage. This is the primary reflex skill — it fires after every `create-entity.sh` call in automated workflows and is the first check in `weekly-review.sh`.

## Acceptance Criteria

- [ ] Detects and reports all violations: missing required fields (`title`, `type`, `kind`, `spine`, `status`, `created`, `aliases`); ROOT with non-empty `parent`; BRANCH or LEAF without `parent`; BRANCH with empty `children`; spine tag in note body; legacy `#flag/` tags in body; `#status/` tags in body; untyped connections; connection count > 7; missing `## Breadcrumb` on BRANCH or LEAF; callout flag count > 3
- [ ] Reports `Lint complete. 0 issues in N notes.` when no violations found
- [ ] Accepts `vault=` and folder path parameters: `cli-lint.sh vault=study projects/aws`
- [ ] Excludes files matching `tpl-*`, `_vocab*`, `_topk*`, `_ontology*` from lint scope
- [ ] Exits 0 with findings on stdout; exits 1 only on script-level errors
- [ ] Emits JSON when `--json` flag passed: `{"vault":"study","folder":"...","issues":[{"file":"...","rule":"...","message":"..."}],"count":N}`
- [ ] `tests/test-cli-lint.sh` passes in the test harness (includes deliberately malformed notes to verify detection)

## Additional Information

Uses `app.metadataCache.getFileCache(f)?.frontmatter` for property reads and `app.vault.cachedRead(f)` for body inspection. Extract `## Connections` section with regex `/^## Connections[\s\S]*?(?=^## |\Z)/m`. The `--json` flag output is consumed by the Auditor subagent (STORY-021) for programmatic triage.

> [!important]
> The test file `test-cli-lint.sh` must create deliberately malformed notes (e.g., LEAF without parent, BRANCH with > 7 connections) to positively verify that each rule fires. Testing only clean notes is insufficient.

## System Design

- [PLAN.md — Story 009](../PLAN.md)
- [obsidian_docs.md — v11 §8 Required frontmatter fields, §11 Flag callouts, §10 Connections](../obsidian_docs.md)

## Resources

- [Obsidian `app.metadataCache.getFileCache(file)`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache): returns `CachedMetadata` with `.frontmatter` (parsed YAML), `.headings` (heading list), `.tags` (tag occurrences), `.sections` (content sections); prefer this over regex-based frontmatter parsing
- [Obsidian `app.vault.cachedRead(file)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/cachedRead): returns the cached file content string; faster than `read()` for read-only operations; note that the cache may lag slightly behind disk writes
- [JavaScript multiline regex `[\s\S]*?`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions): use `/^## SectionName\n([\s\S]*?)(?=\n^## |\Z)/m` to extract section content between two headings; test against notes with Windows-style line endings (`\r\n`) for portability

## Recommendations

- Structure lint rules as an array of `{id, check(frontmatter, body), message}` objects so new rules can be added without modifying the main loop
- Run lint in a single `obsidian eval` call that iterates all files and returns a JSON array of issues — avoid one `eval` call per file to keep runtime under 5 seconds for large vaults
- Include the rule ID in the JSON output (`"rule":"missing-required-field"`) so the Auditor subagent can filter by rule category when triaging

---

> **Blocks**:
>
> - STORY-012 ⛔ — Implement sync-vocab.sh autonomic skill
> - STORY-013 ⛔ — Implement sync-topk.sh autonomic skill
> - STORY-015 ⛔ — Implement weekly-review.sh and morning.sh (lint is the first check)
