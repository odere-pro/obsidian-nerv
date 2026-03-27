---
title: 'Build and execute E2E test suite'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-008 — Schema Evolution and Quality Assurance'
planKey: 'STORY-025'
phase: 5
sequence: 4
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-021
  - STORY-022
  - STORY-023
  - STORY-024
blocks:
  - STORY-026
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 025 acceptance criteria; all prior stories must pass'
---

## Goal

Author `~/.ontology-cli/core/e2e-study.sh` and `~/.ontology-cli/core/e2e-dev.sh` as comprehensive end-to-end lifecycle tests that go beyond the incremental test harness by exercising full multi-skill workflows: project creation through weekly review, agent pattern verification, and migration. These tests validate the complete nervous system as an integrated whole.

## Acceptance Criteria

- [ ] `e2e-study.sh` passes all criteria: project created via `create-project.sh`, 3-level entity tree created via `create-entity.sh`, connections with inverses written via `add-connection.sh`, `cli-lint` / `cli-orphans` / `cli-relations` all clean, `sync-vocab` / `sync-topk` / `sync-ontology` produce correct artifacts, `coverage.sh` and `progress.sh` return valid JSON, `weekly-review.sh` appends to daily note, `context.sh` returns the created entities for a matching query
- [ ] `e2e-dev.sh` passes: project scaffolded, ADR created with correct frontmatter and sections, code-link idempotency verified, dependency-map returns correct edges, weekly-review exits clean
- [ ] Both scripts create a disposable test project at the start, run all assertions, and clean up at the end — leaving no artifacts in the vault
- [ ] Both scripts exit 0 only when all assertions pass; exit 1 with failing assertion names on stderr
- [ ] Total runtime < 120 seconds per script for a vault with ≤ 200 existing notes
- [ ] JSON output validated via `python3 -m json.tool` (macOS built-in, zero installs)
- [ ] `test-harness.sh study` (incremental tests from STORY-005 through STORY-024) also runs clean as a prerequisite check

## Additional Information

Cleanup uses `obsidian eval`: `const folder=app.vault.getAbstractFileByPath('projects/_test-e2e'); await app.vault.trash(folder, false)`. The E2E tests complement the incremental test harness — the harness tests individual skills in isolation while the E2E tests validate multi-skill composition and data flow between skills.

> [!important]
> The E2E test project slug must be `_test-e2e` (underscore prefix) to be visually distinct in the vault and to allow `cli-lint.sh` exclusion patterns to be easily verified. The cleanup step must run even if assertions fail — use a `trap cleanup EXIT` in both E2E scripts.

## System Design

- [PLAN.md — Story 025](../PLAN.md)
- [obsidian_docs.md — v11 E2E test patterns, CLI skill composition](../obsidian_docs.md)

## Resources

- [Bash `trap cleanup EXIT`](https://www.gnu.org/software/bash/manual/bash.html#index-trap): `trap 'cleanup_function' EXIT` ensures the cleanup function runs even when the script exits early due to a failed assertion; define `cleanup_function` to call `obsidian eval` trash before all other cleanup steps
- [`python3 -m json.tool` for JSON validation](https://docs.python.org/3/library/json.html#module-json.tool): `echo "$output" | python3 -m json.tool > /dev/null 2>&1 || { echo "FAIL: invalid JSON"; exit 1; }` validates JSON in a single command without additional dependencies
- [Bash assertion helper pattern](https://www.gnu.org/software/bash/manual/bash.html#Exit-Status): define `assert_success cmd msg` that runs `cmd`, checks `$? -eq 0`, and appends `FAIL: $msg` to a failures array; exit 1 at script end if the failures array is non-empty — this reports all failures rather than stopping at the first one

## Recommendations

- Run `e2e-study.sh` and `e2e-dev.sh` in sequence in CI rather than in parallel — they share the same Obsidian vault instance (Limitation L5) and concurrent vault modifications are not supported
- The E2E scripts should output a progress log to stderr (e.g., `[E2E] Creating project...`) so the operator can monitor progress during the 120-second runtime
- Consider adding a `--keep` flag to skip cleanup for debugging failing assertions — never use this in CI

---

> **Blocks**:
>
> - STORY-026 ⛔ — Validate documentation and cross-references (E2E suite must pass before docs can be validated against the live system)
