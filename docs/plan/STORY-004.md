---
title: 'Build incremental test harness'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 3
epic: 'EPIC-001 — Foundation and Environment'
planKey: 'STORY-004'
phase: 1
sequence: 4
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-003
blocks:
  - STORY-005
  - STORY-006
  - STORY-007
  - STORY-008
  - STORY-009
  - STORY-010
  - STORY-011
  - STORY-012
  - STORY-013
  - STORY-014
  - STORY-015
  - STORY-016
  - STORY-017
  - STORY-018
  - STORY-019
  - STORY-022
  - STORY-023
  - STORY-024
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 004 acceptance criteria'
---

## Goal

Author `~/.ontology-cli/core/test-harness.sh` as a lightweight test runner that creates a disposable `_test-project` in a target vault, executes a named test script or all `test-*.sh` files in a given directory, validates results, cleans up, and reports pass/fail per test. Author `test-lib.sh` with the first test: a round-trip CRUD cycle using `lib.sh` functions directly.

## Acceptance Criteria

- [ ] `test-harness.sh study` creates `projects/_test-project/` with a ROOT note via `ob_eval`, runs all `test-*.sh` files found in `~/.ontology-cli/core/tests/`, cleans up the project, and reports `N passed, M failed` with exit 0 when all pass
- [ ] `test-harness.sh study test-lib.sh` runs only the named test file
- [ ] Cleanup uses `obsidian eval` to trash the test project folder: `app.vault.trash(folder, false)` — never `rm`
- [ ] `test-lib.sh` verifies: `ob_eval` returns expected output, `resolve_vault` resolves both named and default vaults, `daily_append` writes to the current daily note, `rollback_log` creates the log entry, and all cleanup succeeds
- [ ] `test-harness.sh` exits 1 with failing test names on stderr when any test fails; total runtime < 15 seconds for a single test
- [ ] A `tests/` directory exists at `~/.ontology-cli/core/tests/` containing `test-lib.sh`

## Additional Information

Tests must not depend on state from prior test files — the harness creates the test project at the start of each run and tears it down at the end. Each skill story from STORY-005 onward includes a `test-<skill>.sh` acceptance criterion that registers with this harness.

> [!important]
> JSON output validation uses `python3 -m json.tool` (macOS built-in, zero installs per requirement NF2). Cleanup must use `app.vault.trash(folder, false)` — never `rm -rf` on vault directories, as that bypasses Obsidian's link update mechanism.

## System Design

- [PLAN.md — Story 004](../PLAN.md)
- [obsidian_docs.md — v11 Obsidian eval API](../obsidian_docs.md)

## Resources

- [Obsidian `app.vault.trash(file, system)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/trash): `system: false` sends to `.trash/` inside the vault; `system: true` sends to macOS Trash — use `false` to keep cleanup reversible
- [Bash exit code propagation](https://www.gnu.org/software/bash/manual/bash.html#Exit-Status): capture each test script's exit code with `test_exit=$?`; accumulate failures before exiting so all test results are reported
- [`python3 -m json.tool`](https://docs.python.org/3/library/json.html#module-json.tool): validates JSON from stdin and pretty-prints; `echo "$json" | python3 -m json.tool > /dev/null` returns exit 1 if invalid

## Recommendations

- Define a test helper function `assert_eq expected actual msg` in `test-lib.sh` that all subsequent test files can source — reduces boilerplate across 20+ test files
- Each test file should be self-contained: source `lib.sh`, run assertions, exit with the failure count as the exit code
- Keep the test project slug to `_test` prefix so it is visually distinct and easily excluded from lint scopes

---

> **Blocks**:
>
> - STORY-005 ⛔ — Implement create-project.sh skill (test harness must exist)
> - STORY-006 through STORY-024 ⛔ — All subsequent skill stories add `test-<skill>.sh` to this harness
