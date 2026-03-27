---
title: 'Update all commands to use --vault flag'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 8
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-044'
phase: 8
sequence: 3
parallelTrack: B
size: 'L — ~1 day'
dependsOn:
  - STORY-042
blocks:
  - STORY-049
decisionGate: ~
validationBasis: 'bun test exits 0 with zero failures; bun run typecheck exits 0; nerv context --vault my-vault "query" resolves correctly; nerv morning (no flags) uses default vault; vault=<name> positional form no longer accepted by any command'
---

## Goal

Replace the `vault=<name>` positional convention and bare first-arg vault resolution with the `--vault <name>` flag across all command `run()` adapters.
Each command calls `extractVaultFlag(args)` first to strip `--vault <name>` from the args array, then passes the extracted vault value to `resolveVault()`.
Remaining positional args are parsed from the `rest` array returned by `extractVaultFlag`.

## Affected Commands (18 files)

| File                                 | Current pattern                          | Change                                             |
| ------------------------------------ | ---------------------------------------- | -------------------------------------------------- |
| `src/commands/morning.ts`            | `resolveVault(args[0])`                  | `extractVaultFlag` → `resolveVault(vault)`         |
| `src/commands/create-entity.ts`      | `resolveVault(positional[0])` then shift | `extractVaultFlag` first; `positional` from `rest` |
| `src/commands/create-project.ts`     | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/add-connection.ts`     | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/context.ts`            | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/get-entity.ts`         | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/get-tree.ts`           | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/get-knowledge-gap.ts`  | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/cli-lint.ts`           | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/cli-orphans.ts`        | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/cli-relations.ts`      | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/sync-ontology.ts`      | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/sync-vocab.ts`         | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/sync-topk.ts`          | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/import-json.ts`        | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/explain-topic.ts`      | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/weekly-review.ts`      | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/migrate.ts`            | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/dev/adr.ts`            | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/dev/code-link.ts`      | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/dev/dependency-map.ts` | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/dev/dev-cycle.ts`      | `resolveVault(positional[0])`            | same pattern                                       |
| `src/commands/study/quiz.ts`         | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/study/coverage.ts`     | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/study/progress.ts`     | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/web-ingest/add.ts`     | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/web-ingest/batch.ts`   | `resolveVault(args[0])`                  | same pattern                                       |
| `src/commands/web-ingest/monitor.ts` | `resolveVault(args[0])`                  | same pattern                                       |

## Acceptance Criteria

### Migration pattern (apply to every affected command)

- [ ] Add `import { extractVaultFlag } from '../lib/vault-registry'` (adjust relative path for subfolders)
- [ ] Replace the first lines of `run(args)` with:
  ```
  const { vault, rest } = extractVaultFlag(args);
  ```
- [ ] Replace `resolveVault(args[0])` or `resolveVault(positional[0])` with `resolveVault(vault)`
- [ ] Replace subsequent positional references (`args[1]`, `positional[1]`, etc.) with `rest[0]`, `rest[1]`, etc.
- [ ] Update each command's `Usage:` / `--help` string to prepend `[--vault <name>] ` before the existing positional args, e.g.: `'Usage: nerv context [--vault <name>] "<query>" [<limit>]\n'`

### Backward compatibility removal

- [ ] No command's `run()` function reads vault from `args[0]` positionally after this story
- [ ] No command's `Usage:` string references the `vault=<name>` convention

### Test mock updates

- [ ] Unit tests that currently mock `resolveVault` as `async (arg?: string) => arg ?? 'test-vault'` continue to work unchanged — `resolveVault` still receives a string or undefined; mock is compatible with the new signature
- [ ] Unit tests for commands that previously passed `['vault=study', 'projectA']` as args must be updated to pass `['--vault', 'study', 'projectA']`
- [ ] `src/commands/__tests__/create-project.test.ts` — update the `vault=<name>` test case (line ~118) to use `--vault study` form; update test description accordingly
- [ ] All other unit test files that pass args arrays with vault as positional first element must be updated to use `--vault <name>` form

### Typecheck

- [ ] `bun run typecheck` exits 0 after all changes

## Additional Information

This is the highest-effort story in the epic due to the number of files.
Implement changes command-by-command, running `bun test` after each batch of 4–5 files to catch regressions early.
The `extractVaultFlag` helper handles both `--vault name` and optional absence — no error is thrown when `--vault` is absent (that is `resolveVault`'s responsibility).

> [!important]
> Ship STORY-042 and STORY-044 in the same PR. The new `resolveVault()` (STORY-042) rejects `vault=<name>` strings — if STORY-044 is not merged simultaneously, all commands that pass the old positional form will error immediately.

---

> **Blocks**:
>
> - STORY-049 ⛔ — CLI help update (usage strings need to be finalized first)
