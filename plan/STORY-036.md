---
title: 'Migrate orchestration and migration skills to TypeScript with tests'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 5
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-036'
phase: 7
sequence: 5
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-034
  - STORY-035
blocks:
  - STORY-038
decisionGate: ~
validationBasis: 'bun test src/commands/__tests__/weekly-review.test.ts passes; bun test tests/integration/orchestration/ passes with OBSIDIAN_RUNNING=1; nerv migrate --dry-run exits 0'
---

## Goal

Port `weekly-review.sh`, `morning.sh`, and `migrate.sh` from Bash to TypeScript command modules.
The orchestration commands compose reflex and sensory skills as direct module imports — no subprocess spawning.
`migrate.sh` is the highest-blast-radius command in the system; the TypeScript port adds typed validation and a stricter `--dry-run` contract.

## Acceptance criteria

### weekly-review

- [ ] `src/commands/weekly-review.ts` runs 7 sub-commands in sequence by importing their programmatic APIs: `lintProject()` from cli-lint, `findOrphans()` from cli-orphans, `getRelations()` from cli-relations, `syncOntology()`, `syncVocab()`, `syncTopk()`, plus `obsidian unresolved` via `spawnCapture`
- [ ] Buffers all sub-command outputs before appending to the daily note — no partial writes on mid-sequence failure
- [ ] Appends structured summary to today's daily note under `## Ontology Work Log`: lint issue count, orphan count, unknown relations, missing inverses, overflow violations, unresolved link count, timestamp
- [ ] Exits 0 when all sub-commands succeed; exits 1 with the failing command name on stderr when any fails
- [ ] `--json` emits stable schema: `{"lint":{"issues":N},"orphans":{"issues":N},"relations":{"unknown":N},"ontology":{"missingInverses":N},"unresolved":N}`
- [ ] Total runtime < 30 seconds for a 100-note vault

### morning

- [ ] `src/commands/morning.ts` runs 4 steps in sequence: (1) `obsidian daily` (opens daily note), (2) `obsidian daily:append` with inbox backlog count, (3) `obsidian files sort=modified limit=10 --copy`, (4) `obsidian unresolved`
- [ ] All 4 steps use `spawnCapture` for direct Obsidian CLI calls — morning is the only command that uses direct CLI commands exclusively (no `obEval`)
- [ ] Documents the cron entry: `0 8 * * 1-5 ~/.ontology-cli/bin/nerv morning <vault>` for weekday startup

### migrate

- [ ] `src/commands/migrate.ts` reads a JSON migration spec via `Bun.file(path).json()` and applies operations in order
- [ ] Supported operations: `rename-rel`, `rename-spine`, `add-field`, `promote`
- [ ] `--dry-run` reports what would change without modifying any files; output includes operation type, affected note count, and specific note paths
- [ ] Pre-flight validation runs before any modification: exits 1 with specific errors if any operation references non-existent rel-types, spines, or paths
- [ ] Idempotent: re-running an applied migration exits 0 with `0 notes modified` per operation
- [ ] `promote` operation uses `fileManager.renameFile` for automatic wikilink updates
- [ ] Appends migration summary to daily note and updates `_ontology` / `_vocab` `updated:` dates
- [ ] Writes full operation log to `_inbox/_rollback-log.md` via `rollbackLog()`

### Tests

- [ ] `src/commands/__tests__/weekly-review.test.ts`: mocks all 7 sub-command modules; tests orchestration sequence, output buffering, `--json` schema, failure propagation (one sub-command fails → exit 1 with name); at least 5 assertions
- [ ] `src/commands/__tests__/morning.test.ts`: mocks `spawnCapture`; tests 4-step sequence and cron entry documentation; at least 3 assertions
- [ ] `src/commands/__tests__/migrate.test.ts`: tests `--dry-run` with mock vault data (no writes); tests pre-flight validation rejects unknown rel-types; tests idempotency; at least 6 assertions
- [ ] `tests/integration/orchestration/weekly-review.integration.test.ts`: runs against live vault with test project; verifies daily note append and `--json` output shape; requires `OBSIDIAN_RUNNING=1`
- [ ] `tests/integration/orchestration/migrate.integration.test.ts`: runs `--dry-run` then `--apply` on a test project; verifies `rename-rel` rewrites connections; verifies `promote` updates type and renames file; requires `OBSIDIAN_RUNNING=1`
- [ ] `bun test src/commands/__tests__/weekly-review.test.ts src/commands/__tests__/migrate.test.ts` exits 0 without Obsidian

## Additional information

The orchestration commands are the highest-level compositions in the system.
`weekly-review` imports 6 command modules + 1 direct CLI call.
`migrate` is a separate concern — it modifies many files in a single run and carries the highest risk of any command.

> [!important]
> `weekly-review` must buffer ALL sub-command outputs before the daily note append.
> A partial append followed by a failure leaves the daily note in an inconsistent state.
> Use a `results: SubCommandResult[]` array, populate it as each sub-command completes, and write to the daily note only after all 7 have finished (or the first failure is caught).

## System design

- [PLAN.md — Story 036](../PLAN.md)
- [cli/core/weekly-review.sh — Bash source (orchestrator)](../../cli/core/weekly-review.sh)
- [cli/core/morning.sh — Bash source (4-step startup)](../../cli/core/morning.sh)
- [cli/core/migrate.sh — Bash source (high-blast-radius)](../../cli/core/migrate.sh)
- [STORY-024 — original migrate.sh spec](STORY-024.md)

## Resources

- [Bun.spawn for direct CLI calls in morning.ts](https://bun.sh/docs/api/spawn): `spawnCapture(["obsidian", "daily:append", `vault=${vault}`, `content=${text}`])` for the 4 morning steps — these are direct CLI commands, not `obEval` calls
- [TypeScript `Promise.allSettled` for parallel sub-commands](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled): consider running independent lint/orphan/relation checks in parallel via `Promise.allSettled` while keeping sync-\* commands sequential — reduces total runtime
- [JSON migration spec schema validation](https://bun.sh/docs/api/utils#bun-deepequals): validate the spec structure with a TypeScript interface check before execution; use discriminated union `MigrationOp = RenameRelOp | RenameSpineOp | AddFieldOp | PromoteOp` for exhaustive matching

## Recommendations

- For `weekly-review`, run `cli-lint` first (fastest) and `sync-ontology` last (slowest) to surface basic issues early
- For `migrate`, implement pre-flight validation as a shared function between `--dry-run` and apply paths — identical logic, only the write step differs
- Consider a `--verbose` flag for `weekly-review` that prints each sub-command's output as it completes (vs the default summary-only mode) — useful for debugging slow runs

## Security considerations

| Area                       | Risk                                                          | Mitigation                                                                                                                  |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Migration spec injection   | `add-field` writes user-supplied values into YAML frontmatter | `processFrontMatter` serialises safely; additionally validate no YAML-breaking chars (`:`, `#`, `[`, `]`) in field values   |
| Path traversal in promote  | `promote` op renames files to a derived path                  | Assert the new path starts with `projects/<slug>/` before calling `renameFile`                                              |
| Destructive bulk operation | A single `migrate` run modifies many files                    | `--dry-run` is mandatory before `--apply`; integration test must run `--dry-run` first and compare counts before apply step |

---

> **Blocks**:
>
> - STORY-038 ⛔ — Build, install, remove Bash (all commands must be ported before Bash removal)
