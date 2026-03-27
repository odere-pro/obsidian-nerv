---
title: 'Implement create-entity.sh motor skill'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 5
epic: 'EPIC-002 — Motor Skills: CRUD Operations'
planKey: 'STORY-006'
phase: 2
sequence: 2
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-003
  - STORY-005
blocks:
  - STORY-009
  - STORY-010
  - STORY-017
  - STORY-018
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 006 acceptance criteria'
---

## Goal

Author `create-entity.sh` in `~/.ontology-cli/core/` to create a single typed note from the correct template, populate all frontmatter fields, wire it into the parent's `children:` array, and log creation to the daily note. This is the primary motor skill for knowledge capture — the Writer subagent invokes it exclusively for all note creation.

## Acceptance Criteria

- [ ] `create-entity.sh study testproj LEAF test-leaf "Test Leaf" ROOT concept testproj` creates `projects/testproj/TESTPROJ.test-leaf - Test Leaf.md` with `type: LEAF`, `kind: concept`, `spine: testproj`, `status: draft`, `parent: "[[TESTPROJ.ROOT - ...]]"`
- [ ] The parent note's `children:` array is updated to include `"[[TESTPROJ.test-leaf - Test Leaf]]"` using `app.fileManager.processFrontMatter`
- [ ] Spine is inherited from the parent note's `spine` field when not explicitly passed
- [ ] `daily_append()` from lib.sh writes `- Created [[TESTPROJ.test-leaf - Test Leaf]]` to the current daily note
- [ ] Exits 1 with a stderr message if the parent note is not found
- [ ] Exits 0 without modification if a note with the same path already exists (idempotent)
- [ ] Emits JSON when `--json` flag passed: `{"created":true,"path":"...","title":"..."}`
- [ ] If note creation succeeds but parent `children:` update fails, `rollback_log` records the partial state and exits 1
- [ ] `tests/test-create-entity.sh` passes in the test harness

## Additional Information

Template selection: LEAF → `tpl-leaf.md`, BRANCH → `tpl-branch.md`, ROOT → `tpl-root.md`. Uses `app.fileManager.processFrontMatter` for all property writes — this is the only approved write path (requirement R8). The `--json` flag is required by sensory skills that parse output programmatically.

> [!important]
> `app.fileManager.processFrontMatter` is an async Obsidian API — it must be called inside an `async` IIFE in the `obsidian eval` expression. Failure to await it results in silently missing frontmatter updates.

## System Design

- [PLAN.md — Story 006](../PLAN.md)
- [obsidian_docs.md — v11 §8 Frontmatter fields, §21 LEAF-to-BRANCH promotion](../obsidian_docs.md)

## Resources

- [Obsidian `app.fileManager.processFrontMatter(file, fn)`](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter): atomic read-modify-write of YAML frontmatter; the callback receives the parsed frontmatter object and any mutations are written back; avoids race conditions compared to manual read-parse-write
- [Obsidian `app.vault.create(path, content)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/create): creates a new file with the given content string; throws if the file already exists — wrap in existence check for idempotency
- [YAML array append in processFrontMatter](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter): if `frontmatter.children` is undefined, initialize as `[]` before pushing; `processFrontMatter` serializes the result back to YAML automatically

## Recommendations

- Parse the parent note path from the `parent:` frontmatter of the parent note rather than constructing it from parameters — this ensures the wikilink format matches exactly
- The `--json` output must be valid JSON even on error: emit `{"created":false,"error":"<message>"}` on failures so the Writer subagent can handle errors programmatically
- Implement spine inheritance early — it reduces the parameter burden on the Writer subagent for deep entity hierarchies

## Security Considerations

| Area                  | Risk                                                                    | Mitigation                                                                                                                |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shell injection       | `TITLE` parameter passed through `sed` for placeholder replacement      | Escape special sed characters in `TITLE` before substitution; use Python for replacement if the title may contain slashes |
| Path traversal        | `PROJECT_SLUG` and `ENTITY_SLUG` interpolated into vault-relative paths | Validate both slugs are alphanumeric-plus-hyphens; assert resolved path starts with `$VAULT_PATH/projects/`               |
| Frontmatter injection | `TITLE` written directly into YAML frontmatter                          | Quote the title value in YAML: `title: "{{ TITLE }}"` — a title containing `:` or `#` would break unquoted YAML           |

---

> **Blocks**:
>
> - STORY-009 ⛔ — Implement cli-lint.sh reflex skill (entities to lint)
> - STORY-010 ⛔ — Implement cli-orphans.sh reflex skill (entities to audit)
> - STORY-017 ⛔ — Implement get-entity.sh sensory skill (entities to retrieve)
> - STORY-018 ⛔ — Implement get-tree.sh sensory skill (entities to traverse)
