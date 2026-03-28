---
title: 'Refactor medium-risk commands to VaultOps port'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-054'
phase: 9
sequence: 4
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-051
blocks:
  - STORY-058
decisionGate: ~
validationBasis: 'grep -rn "from.*lib/obsidian" src/commands/create-entity.ts src/commands/create-project.ts src/commands/add-connection.ts src/commands/import-json.ts returns zero matches; bun test exits 0 for all four command test files; bun run typecheck exits 0'
---

## Goal

Replace direct `obEval` calls in the four CRUD commands with `VaultOps` port calls. These commands are medium-risk because they perform multi-step mutations (create + update parent + log daily) with rollback logging on partial failure. The refactor must preserve the idempotency checks, rollback behaviour, and JSON output flags exactly — only the I/O mechanism changes.

**Commands in scope:** `create-entity.ts`, `create-project.ts`, `add-connection.ts`, `import-json.ts`.

## Acceptance Criteria

### Import change (all 4 files)

- [ ] `import { obEval, dailyAppend, rollbackLog, resolveVault } from '../lib/obsidian'` replaced with `import { getVaultOps } from '../ports/provider'`
- [ ] `rollbackLog` is NOT part of `VaultOps` — it remains a direct import from `src/lib/obsidian.ts`. If rollbackLog's implementation is itself an `appendToFile` call, that call routes through the adapter internally; externally `rollbackLog()` is still called from commands unchanged.
- [ ] `resolveVault` import kept as-is from `src/lib/obsidian.ts`

### `create-entity.ts`

- [ ] `const ops = getVaultOps()` at the top of the core logic
- [ ] Idempotency check: `await ops.fileExists(vault, entityPath)` replaces the `obEval` expression that tests for path existence
- [ ] Parent lookup: `await ops.listFiles(vault)` + TypeScript filter for the parent slug replaces the `obEval` that searches for the parent note
- [ ] File creation: `await ops.createFile(vault, entityPath, renderedContent)` replaces `obEval("app.vault.create(...)")`
- [ ] Parent update: `await ops.updateFrontmatter(vault, parentPath, { children: updatedChildrenArray })` replaces the `obEval` that calls `processFrontMatter`
- [ ] Daily log: `await ops.appendToDaily(vault, logLine)` replaces `dailyAppend(vault, logLine)`
- [ ] Rollback on partial failure: `rollbackLog(vault, 'create-entity', ...)` call unchanged
- [ ] `--json` output unchanged

### `create-project.ts`

- [ ] Idempotency check uses `await ops.fileExists(vault, rootNotePath)`
- [ ] All 5 file creation steps use `await ops.createFile(vault, path, content)` individually — maintain the existing ordered sequence so `rollbackLog` can identify the partial state
- [ ] Rollback call unchanged

### `add-connection.ts`

- [ ] Source note read: `await ops.readFile(vault, sourcePath)` replaces the `obEval` that reads note content + frontmatter
- [ ] Ontology read: `await ops.readFile(vault, ontologyPath)` replaces the `obEval` that fetches relationship types
- [ ] Forward connection write: `await ops.appendToFile(vault, sourcePath, connectionLine)` replaces the `obEval` append
- [ ] Inverse connection write: `await ops.appendToFile(vault, targetPath, inverseConnectionLine)` replaces the inverse `obEval` append
- [ ] Partial-failure rollback (forward written, inverse failed): `rollbackLog` call unchanged

### `import-json.ts`

- [ ] Loop over each JSON item calls `await ops.fileExists(vault, path)` for idempotency
- [ ] `await ops.createFile(vault, path, content)` replaces `obEval` create per item
- [ ] `Created: N, Skipped: M` output unchanged

### Existing tests (all 4 command test files)

- [ ] `mock.module('../../lib/obsidian', ...)` blocks replaced with `setVaultOps(inlineMockOps)` in `beforeEach`
- [ ] Inline mock `VaultOps` stubs the exact methods each command under test calls — no more `mockImplementationOnce` chains tuned to Obsidian JS expression output strings
- [ ] Rollback scenario tests: inline mock's `updateFrontmatter` (or `appendToFile`) throws → `rollbackLog` spy called
- [ ] `bun test src/commands/__tests__/create-entity.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/create-project.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/add-connection.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/import-json.test.ts` exits 0

### Typecheck

- [ ] `bun run typecheck` exits 0

## Additional Information

**`rollbackLog` treatment:** `rollbackLog` in `src/lib/obsidian.ts` is a higher-level operation that formats a Markdown table row and appends it to `_inbox/_rollback-log.md`. Internally it calls `obEval` (or, after the adapter is wired, it could call `ops.appendToFile`). However, commands call `rollbackLog` as an auditing primitive — it is NOT exposed on the `VaultOps` interface because its contract is richer than a plain file append. Leave `rollbackLog` as a direct import from `src/lib/obsidian.ts` for now. A future refactor may move it to the adapter if the implementation is simplified.

**`updateFrontmatter` for `children` array:** The `create-entity.ts` logic reads the parent's `children` array, appends the new child wikilink, then calls `ops.updateFrontmatter(vault, parentPath, { children: newArray })`. This is a read-modify-write in two port calls. The Obsidian adapter translates `updateFrontmatter` to a `processFrontMatter` callback internally, which is atomic on the Obsidian side. The two-call pattern (read then write) is acceptable here because concurrent multi-agent writes are out of scope (limitation L5).

---

> **Blocks**:
>
> - STORY-058 ⛔ — Test migration story requires all command refactors complete
