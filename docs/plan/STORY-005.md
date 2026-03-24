---
title: 'Implement create-project.sh motor skill'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 3
epic: 'EPIC-002 — Motor Skills: CRUD Operations'
planKey: 'STORY-005'
phase: 2
sequence: 1
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-001
  - STORY-003
  - STORY-004
blocks:
  - STORY-006
  - STORY-007
  - STORY-008
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 005 acceptance criteria'
---

## Goal

Author `create-project.sh` in `~/.ontology-cli/core/` to scaffold a complete project — ROOT note, `_ontology`, `_vocab`, `_topk`, and `.base` file — in one command. This is the foundation motor skill; every other CRUD skill targets entities within projects that this script creates.

## Acceptance Criteria

- [ ] `create-project.sh study aws "Amazon Web Services"` produces exactly 5 files in `projects/aws/`: `AWS.ROOT - Amazon Web Services.md`, `_ontology.aws.md`, `_vocab.aws.md`, `_topk.aws.md`, `aws.base`
- [ ] ROOT note frontmatter: `type: ROOT`, `kind: concept`, `spine: aws`, `status: draft`, `created` and `modified` set to today in `YYYY-MM-DD`
- [ ] `_ontology.aws.md` contains the full 10-row default relationship types table from `tpl-ontology.md`
- [ ] `aws.base` contains `file.inFolder("projects/aws")` — the `PROJECT_SLUG_PLACEHOLDER` replaced via `sed`
- [ ] Re-running on an existing project exits 0 with no file modifications (idempotent)
- [ ] `vault=` parameter routes to the correct vault: `create-project.sh vault=dev-projectA svc "My Service"` creates in the dev vault
- [ ] File creation verified via `app.vault.getAbstractFileByPath` — not `ls`
- [ ] If the ROOT note is created but a subsequent file fails, `rollback_log` records the partial state before exiting 1
- [ ] `tests/test-create-project.sh` passes in the test harness

## Additional Information

Naming convention: `[PROJECT_UPPERCASE].[slug] - [Title].md` where `PROJECT` is the slug uppercased via `tr '[:lower:]' '[:upper:]'`. Idempotency check: `app.vault.getAbstractFileByPath(path)` — if non-null, skip and exit 0. Sources `lib.sh`.

> [!important]
> Template files must exist in the vault's `_templates/` directory (provisioned by STORY-001) before this script can copy them. The `sed -i ''` placeholder replacement uses BSD sed syntax — test on macOS explicitly.

## System Design

- [PLAN.md — Story 005](../PLAN.md)
- [obsidian_docs.md — v11 §8 Frontmatter, §14 Templates, project structure](../obsidian_docs.md)

## Resources

- [Obsidian `app.vault.getAbstractFileByPath(path)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/getAbstractFileByPath): returns `TAbstractFile | null`; use as idempotency check to avoid duplicate file creation
- [macOS `sed -i '' 's/PLACEHOLDER/value/g'`](https://ss64.com/mac/sed.html): BSD sed in-place edit syntax; test with `sed --version` to confirm BSD vs GNU
- [Bash `tr '[:lower:]' '[:upper:]'`](https://ss64.com/mac/tr.html): POSIX character class translation for uppercase conversion, zero dependencies

## Recommendations

- Process files in creation order (ROOT → ontology → vocab → topk → base) so `rollback_log` can accurately report which step failed
- The ROOT note's `children: []` field should be initialized as an empty YAML array — not omitted — so `create-entity.sh` can append to it without handling the missing-field case
- Test the `vault=` parameter routing explicitly since vault resolution is the most common source of silent failures

## Security Considerations

| Area            | Risk                                                                          | Mitigation                                                                                       |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Shell injection | `SLUG` and `TITLE` parameters interpolated into file paths and `sed` patterns | Validate slug is alphanumeric-plus-hyphens before use; quote all variables in path constructions |
| Path traversal  | `SLUG` value like `../../etc` could write outside the vault                   | Validate that resolved output path starts with `$VAULT_PATH/projects/`                           |

---

> **Blocks**:
>
> - STORY-006 ⛔ — Implement create-entity.sh skill (project must exist)
> - STORY-007 ⛔ — Implement add-connection.sh skill (project with `_ontology` must exist)
> - STORY-008 ⛔ — Implement import-json.sh (project must exist)
