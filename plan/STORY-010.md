---
title: 'Implement cli-orphans.sh reflex skill'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-003 — Reflex Skills: Automated Auditing'
planKey: 'STORY-010'
phase: 3
sequence: 2
parallelTrack: B
size: 'M — ~0.5 day'
dependsOn:
  - STORY-003
  - STORY-006
blocks:
  - STORY-015
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 010 acceptance criteria'
---

## Goal

Author `cli-orphans.sh` in `~/.ontology-cli/core/` to verify bidirectional parent↔children link integrity across all project notes using Obsidian's metadata cache. This reflex skill detects four failure modes: BRANCH/LEAF with no parent, parent reference to a non-existent note, parent that does not list this note as a child, and child listed by a parent whose `parent` field does not match.

## Acceptance Criteria

- [ ] Detects BRANCH or LEAF with no `parent` field: `✗ ORPHAN: <note> (<type>) has no parent`
- [ ] Detects broken parent references (wikilink resolves to no file): `✗ BROKEN: <note> → parent '<n>' not found`
- [ ] Detects parent/child mismatch: `✗ MISMATCH: <note> parent='<p>', parent doesn't list it as child`
- [ ] Detects reverse mismatch (parent lists child that doesn't exist): `✗ BROKEN: <parent> lists child '<n>' — not found`
- [ ] Reports `Link check complete. 0 issues in N notes.` when no issues found
- [ ] Emits JSON when `--json` flag: `{"issues":[{"type":"ORPHAN|BROKEN|MISMATCH","note":"...","detail":"..."}],"count":N}`
- [ ] Excludes ROOT notes from the "no parent" check — ROOT has empty parent by design
- [ ] `tests/test-cli-orphans.sh` passes in the test harness

## Additional Information

Uses `app.metadataCache.getFileCache(f)?.frontmatter` for parent/children property reads; uses `app.vault.getAbstractFileByPath` to verify existence of referenced notes. Never use `grep` for path resolution — the metadata cache handles aliased wikilinks correctly.

> [!important]
> Wikilinks in `children:` and `parent:` frontmatter may include display aliases (`[[path|alias]]`). Use `app.metadataCache.resolveSubpath` or strip the alias suffix before calling `getAbstractFileByPath`.

## System Design

- [PLAN.md — Story 010](../PLAN.md)
- [obsidian_docs.md — v11 §9 Parent/children hierarchy, wikilink resolution](../obsidian_docs.md)

## Resources

- [Obsidian `app.vault.getAbstractFileByPath(path)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/getAbstractFileByPath): returns `TAbstractFile | null`; use to verify that a wikilink target actually exists on disk
- [Obsidian wikilink resolution](https://help.obsidian.md/Linking+notes+and+files/Internal+links): shortest-path links may not include the full path; use `app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)` to resolve a raw wikilink string to a `TFile`
- [Obsidian `app.metadataCache.getFileCache(file)?.frontmatter`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache): frontmatter `children` field is a YAML array of wikilink strings; iterate to check each child

## Recommendations

- Build a lookup map of all notes (`path → frontmatter`) in a single `obsidian eval` call at script start, then perform all checks in JavaScript without additional `eval` calls
- Report all four issue types in a single scan pass to minimize Obsidian eval invocations
- The test harness fixture should include: an orphaned LEAF, a broken parent wikilink, and a parent/child mismatch pair — one fixture for each failure mode

---

> **Blocks**:
>
> - STORY-015 ⛔ — Implement weekly-review.sh (orphans check is included in the review sequence)
