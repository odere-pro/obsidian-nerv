---
title: 'Implement sync-topk.sh autonomic skill'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 2
epic: 'EPIC-004 — Autonomic Skills: Sync and Review'
planKey: 'STORY-013'
phase: 3
sequence: 5
parallelTrack: A
size: 'S — ~2 h'
dependsOn:
  - STORY-003
  - STORY-009
blocks:
  - STORY-015
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 013 acceptance criteria'
---

## Goal

Author `sync-topk.sh` in `~/.ontology-cli/core/` to append rows to a project's `_topk.[project].md` overflow log for any note exceeding connection, callout flag, or children limits, without duplicating existing entries.

## Acceptance Criteria

- [ ] `sync-topk.sh study aws` appends a row to `_topk.aws.md`'s `## Overflow Log` for each note exceeding 7 connections, 3 callout flags, or 7 BRANCH children; never duplicates entries for the same note+field combination; updates `updated:` date
- [ ] Re-running produces no additional entries or duplicate rows (idempotent)
- [ ] Accepts `vault=` parameter; exits 0 on success, 1 on error
- [ ] `tests/test-sync-topk.sh` passes in the test harness

## Additional Information

Reads `## Connections` line count and callout flag count per note via `app.vault.cachedRead`. Deduplication checks the existing overflow log for a matching note+field row before appending. The overflow log entry format: `| <date> | <note-wikilink> | <field> | <count> | <threshold> |`.

> [!important]
> The overflow log is append-only — it records historical violations. Do not remove rows when a violation is resolved; that is handled by the operator reviewing the log. The `updated:` frontmatter date reflects the last sync run, not the last violation.

## System Design

- [PLAN.md — Story 013](../PLAN.md)
- [obsidian_docs.md — v11 `_topk` structure, overflow log format, limit thresholds](../obsidian_docs.md)

## Resources

- [Obsidian `app.vault.cachedRead(file)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/cachedRead): use to count connection lines (`/^- [a-z-]+ :: \[\[/gm`.match count) and callout flag lines (`/^> \[!flag\]/gm`.match count) without parsing the entire AST
- [`app.vault.process(file, fn)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/process): use for atomic append to `## Overflow Log` section — read current content, check for duplicate row, append if new, write back
- [JavaScript array `.some()` for duplicate check](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some): `rows.some(r => r.includes(notePath) && r.includes(field))` before appending is a sufficient deduplication check for the overflow log

## Recommendations

- Run `sync-topk.sh` after `cli-lint.sh` in `weekly-review.sh` so the lint issue count is already known and can be correlated with overflow entries
- Keep the overflow log entry format pipe-delimited Markdown table for human readability in Obsidian — avoid custom formats that require special tooling to read
- Cap the overflow log at 200 rows; emit a warning when the cap is reached to prompt operator cleanup

---

> **Blocks**:
>
> - STORY-015 ⛔ — Implement weekly-review.sh (sync-topk is part of the review sequence)
