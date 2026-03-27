---
title: 'Implement migrate.sh schema migration skill'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 8
epic: 'EPIC-008 — Schema Evolution and Quality Assurance'
planKey: 'STORY-024'
phase: 5
sequence: 3
parallelTrack: B
size: 'XL — ~2 days'
dependsOn:
  - STORY-003
  - STORY-007
  - STORY-012
blocks:
  - STORY-025
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 024 acceptance criteria'
---

## Goal

Author `migrate.sh` in `~/.ontology-cli/core/` to apply bulk schema changes to a project's notes from a declarative migration spec: rename relationship types, rename or merge spines, add new frontmatter fields with default values, promote LEAF notes to BRANCH, and update `_ontology` / `_vocab` / `_topk` artifacts to reflect the new schema.

## Acceptance Criteria

- [ ] `migrate.sh study aws /tmp/migration.json` reads a JSON migration spec and applies all operations in order
- [ ] Supported operations: `rename-rel` (renames a relationship type across all `## Connections` sections and `_ontology`), `rename-spine` (updates `spine` frontmatter on all matching notes and `_vocab`), `add-field` (adds a frontmatter field with a default value to all notes matching a filter), `promote` (changes a LEAF to BRANCH: updates `type`, adds `children: []`, renames file to BRANCH convention via `app.fileManager.renameFile`)
- [ ] Each operation emits a log line: `Applied <operation> to N notes`
- [ ] A `--dry-run` flag reports what would change without modifying any files
- [ ] Re-running an already-applied migration exits 0 with `0 notes modified` for each operation (idempotent)
- [ ] Before applying, validates the migration spec and exits 1 with specific errors if any operation references non-existent relationship types, spines, or note paths
- [ ] Appends a migration summary to the daily note and updates `_ontology` / `_vocab` `updated:` dates
- [ ] `tests/test-migrate.sh` passes in the test harness

## Additional Information

Migration spec format: `[{"op":"rename-rel","from":"triggers","to":"activates"},{"op":"promote","note":"TESTPROJ.leaf-a"}]`. The `rename-rel` operation must update both forward and inverse entries in `_ontology`, and rewrite all matching connection lines across all project notes. The `promote` operation uses `app.fileManager.renameFile` which auto-updates all wikilinks — document this dependency on the move pattern from STORY-008.

> [!important]
> `migrate.sh` is a high-blast-radius operation — it modifies many files in a single run. The `--dry-run` flag is not optional; it must be implemented and tested before the apply path. Always run `--dry-run` first in the test harness fixture to verify the expected change count.

## System Design

- [PLAN.md — Story 024](../PLAN.md)
- [obsidian_docs.md — v11 §21 LEAF-to-BRANCH promotion, schema evolution patterns](../obsidian_docs.md)

## Resources

- [Obsidian `app.fileManager.renameFile(file, newPath)`](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/renameFile): renames/moves a file and automatically updates all wikilinks in the vault that point to the old path; this is the only safe rename mechanism — never use `app.vault.rename` for note files with existing links
- [`app.fileManager.processFrontMatter(file, fn)` for `add-field` and `rename-spine`](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter): the callback receives the mutable frontmatter object; `frontmatter[newKey] = defaultValue` adds a field; `frontmatter.spine = newSpine` renames the spine; Obsidian serializes the result back to YAML
- [JSON migration spec validation with Python `jsonschema`](https://docs.python.org/3/library/json.html): validate the spec array with `python3 -c "import json,sys; ops=json.load(open(sys.argv[1])); ..."` — check that each `op` value is one of the four supported operations and that required fields (`from`/`to` for rename-rel, `note` for promote) are present before executing

## Recommendations

- Implement pre-flight validation as a separate function that runs before any modification, so `--dry-run` and the apply path share the same validation code
- After all operations complete, call `sync-vocab.sh` automatically if any `rename-spine` operations were applied — this keeps the vocabulary index consistent without manual follow-up
- Log the migration to `_inbox/_rollback-log.md` with the full operation list and affected note paths so the operator can manually reverse the migration if needed

## Security Considerations

| Area                            | Risk                                                                     | Mitigation                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arbitrary frontmatter injection | `add-field` operation writes user-supplied `value` into YAML frontmatter | Validate that the `value` does not contain YAML-breaking characters (`:`, `#`, `[`, `]`) or use `processFrontMatter` which serializes safely via the Obsidian YAML serializer |
| File rename path traversal      | `promote` operation renames files to a derived path                      | Assert the new path starts with `$VAULT_PATH/projects/$SLUG/` before calling `renameFile`                                                                                     |
| Destructive bulk operation      | A single `migrate.sh` run can modify all notes in a project              | Require `--dry-run` to be confirmed before `--apply` in the test harness; document this as a two-step process in the companion guide                                          |

---

> **Blocks**:
>
> - STORY-025 ⛔ — Build and execute E2E test suite (migration is tested in the E2E suite)
