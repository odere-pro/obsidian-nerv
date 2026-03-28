---
title: 'Migrate all command unit tests to MockVaultOps'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 5
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-058'
phase: 9
sequence: 6
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-053
  - STORY-054
  - STORY-055
  - STORY-056
  - STORY-057
blocks: []
decisionGate: ~
validationBasis: 'bun test exits 0 (all 37 unit tests pass); grep -rn "mock.module.*lib/obsidian" src/commands/**/__tests__/ returns zero matches; grep -rn "MockVaultOps" src/commands/**/__tests__/ matches at least one import per test file that calls VaultOps methods'
---

## Goal

Replace the per-test `mock.module('../../lib/obsidian', () => ({ obEval: mock(...) }))` pattern across all command unit tests with the stateful `MockVaultOps` from STORY-057. Each test pre-populates the in-memory vault with the state the command expects to find, runs the command, and asserts the resulting vault state — rather than asserting which mock function was called with which Obsidian JS string. This makes tests resilient to adapter implementation changes: if the adapter rewrites an expression, tests don't break unless observable vault state changes.

## Acceptance Criteria

### Global pattern replacement (all 37 command test files)

- [ ] No `mock.module('../../lib/obsidian', ...)` or `mock.module('../../lib/shell', ...)` blocks remain in any command test file that has been refactored to use VaultOps in STORY-053–056
- [ ] Each refactored test file imports `{ MockVaultOps, seedFile }` from `'../../ports/__tests__/mock-vault-ops'` and `{ setVaultOps }` from `'../../ports/provider'`
- [ ] `beforeEach`: creates a fresh `MockVaultOps`, calls `setVaultOps(mockOps)`, seeds any prerequisite vault state
- [ ] `afterEach`: calls `setVaultOps(new ObsidianCliAdapter())` to restore the real adapter (or uses a test-scoped provider reset)

### Per-command test migration pattern

Each test that previously asserted `mockObEval.mock.calls[0][0]` contains a JS string now instead:

1. Seeds the expected vault state using `seedFile(mockOps, vault, path, content, frontmatter)` in `beforeEach`
2. Calls the command's `run()` function
3. Asserts vault state after: `expect(await mockOps.readFile(vault, path)).toMatchObject({ frontmatter: { ... } })` or `expect(await mockOps.fileExists(vault, path)).toBe(true)`

- [ ] `create-entity.test.ts` — seed parent note; run; assert child created, parent `children` updated, daily note contains log line
- [ ] `create-project.test.ts` — seed empty vault; run; assert 5 files exist
- [ ] `add-connection.test.ts` — seed source + target + ontology notes; run; assert connection lines appended to both notes
- [ ] `import-json.test.ts` — seed existing key for skip test; assert created count and skipped count
- [ ] `cli-lint.test.ts` — seed notes with various frontmatter states; run; assert lint report identifies violations
- [ ] `cli-orphans.test.ts` — seed notes with/without parent; run; assert orphan list
- [ ] `cli-relations.test.ts` — seed notes with connection frontmatter; run; assert relation map output
- [ ] `sync-ontology.test.ts` — seed ontology note; run with update; assert frontmatter changed
- [ ] `sync-vocab.test.ts` — same pattern as sync-ontology
- [ ] `sync-topk.test.ts` — same pattern
- [ ] `web-ingest/add.test.ts` — seed parent note and vault (empty); run with URL; assert new note created with `url` frontmatter, parent connections updated
- [ ] `web-ingest/batch.test.ts` — seed vault; run batch file; assert multiple notes created
- [ ] `web-ingest/monitor.test.ts` — seed monitor state note; run; assert state updated
- [ ] `morning.test.ts` — seed daily note and inbox files; run; assert daily note content updated
- [ ] `explain-topic.test.ts` — seed related notes; run; assert output contains expected content
- [ ] `dev/adr.test.ts` — seed ADR note; run status patch; assert frontmatter updated
- [ ] `dev/code-link.test.ts` — seed note; run link; assert `codeLink` frontmatter set

### Rollback scenario tests preserved

- [ ] For commands with rollback (create-entity, create-project, add-connection): one test case triggers a failure by making `MockVaultOps.updateFrontmatter` throw; asserts `rollbackLog` was called (spy on `rollbackLog` from `src/lib/obsidian.ts`)

### Tests that remain on `mock.module` (not refactored)

- [ ] `src/lib/__tests__/obsidian.test.ts` — tests the `obEval`/`resolveVault` internals; keeps shell mock
- [ ] `src/lib/__tests__/shell.test.ts` — tests raw subprocess; no VaultOps involved
- [ ] `src/adapters/__tests__/obsidian-cli.unit.test.ts` — tests the adapter internals; keeps shell mock

### Final verification

- [ ] `bun test` exits 0 (all tests pass)
- [ ] `bun run typecheck` exits 0
- [ ] `grep -rn "mock.module.*lib/obsidian" src/commands/` returns zero matches
- [ ] Test suite runtime does not increase — MockVaultOps has zero subprocess overhead vs. mocked spawnCapture

## Additional Information

**Migration strategy:** Migrate one command test file at a time. Commit after each file passes. This minimises the diff size and makes rollback easier if a test assumption is wrong.

**Assertion shift:** The key mental model change: old tests asserted _how_ (which JS string was passed to evalObsidian); new tests assert _what_ (what vault state resulted). This makes tests survive adapter rewrites, CLI version bumps, and expression optimisations without modification.

**`rollbackLog` spy:** `rollbackLog` is still imported directly in commands (not via VaultOps). Spy on it with `spyOn` from `bun:test` — no `mock.module` needed. The spy intercepts the call before it reaches `obEval` (which is now inside the adapter, not called directly by the command).

**Scope of `mock.module` removal:** Only `mock.module` calls targeting `lib/obsidian` and `lib/shell` from command test files are removed. `mock.module` calls for other modules (e.g., `lib/defuddle`, `lib/vault-registry`) are unchanged.
