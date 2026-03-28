---
title: 'Refactor low-risk commands to VaultOps port'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-053'
phase: 9
sequence: 3
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-051
blocks:
  - STORY-058
decisionGate: ~
validationBasis: 'grep -rn "from.*lib/obsidian" src/commands/cli-lint.ts src/commands/cli-orphans.ts src/commands/cli-relations.ts src/commands/sync-ontology.ts src/commands/sync-vocab.ts src/commands/sync-topk.ts returns zero matches; bun test exits 0 for all six command test files; bun run typecheck exits 0'
---

## Goal

Replace all direct `obEval` imports in six read-heavy command files with calls through the `VaultOps` port obtained via `getVaultOps()`. These commands are low-risk because they perform only `listFiles` and `readFile` operations — no multi-step mutations, no rollback concerns. They are the safest starting point for the refactor: isolate the pattern, validate it compiles and tests pass, then proceed to more complex commands.

**Commands in scope:** `cli-lint.ts`, `cli-orphans.ts`, `cli-relations.ts`, `sync-ontology.ts`, `sync-vocab.ts`, `sync-topk.ts`.

## Acceptance Criteria

### Import change (all 6 files)

- [ ] `import { obEval, resolveVault } from '../lib/obsidian'` removed from all 6 files
- [ ] `import { getVaultOps } from '../ports/provider'` added to all 6 files
- [ ] `resolveVault` import moved to use the same call from `src/lib/obsidian.ts` via the provider if needed, or kept as a direct import — `resolveVault` is not part of `VaultOps` and is not changed

### `cli-lint.ts`

- [ ] `const ops = getVaultOps()` at the top of `run()`
- [ ] Existing `obEval(vault, "app.vault.getMarkdownFiles().map(...)")` replaced with `await ops.listFiles(vault)` — filter and shape the result in TypeScript
- [ ] All subsequent frontmatter access reads from the returned `VaultFileEntry.frontmatter` object

### `cli-orphans.ts`

- [ ] `await ops.listFiles(vault)` replaces the `obEval` that fetches all notes
- [ ] Orphan detection logic (filter for `children: []` + no parent wikilink) operates on `VaultFileEntry[]` in TypeScript — no change to business logic

### `cli-relations.ts`

- [ ] `await ops.listFiles(vault)` replaces the `obEval` that fetches all notes with backlinks
- [ ] Relationship mapping logic unchanged; works on `VaultFileEntry[]`

### `sync-ontology.ts`

- [ ] `await ops.readFile(vault, ontologyPath)` replaces `obEval` that reads the ontology note
- [ ] `await ops.updateFrontmatter(vault, ontologyPath, mutations)` replaces `obEval` that writes updated metadata
- [ ] If the ontology note does not exist, `readFile` propagates the error — no change to error handling behaviour

### `sync-vocab.ts`

- [ ] Same substitution pattern as `sync-ontology.ts` applied to the vocabulary note path

### `sync-topk.ts`

- [ ] Same substitution pattern as `sync-ontology.ts` applied to the top-K note path

### Existing tests (all 6 command test files)

- [ ] Each test file replaces `mock.module('../../lib/obsidian', () => ({ obEval: mock(...) }))` with `import { setVaultOps } from '../../ports/provider'` and sets a mock `VaultOps` implementation in `beforeEach`
- [ ] Mock `VaultOps` used in this story: a minimal inline object literal with `listFiles` or `readFile`/`updateFrontmatter` stubbed via `mock()` — full `MockVaultOps` from STORY-057 is used in STORY-058
- [ ] All existing test assertions remain unchanged — only the mock setup differs
- [ ] `bun test src/commands/__tests__/cli-lint.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/cli-orphans.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/cli-relations.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/sync-ontology.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/sync-vocab.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/sync-topk.test.ts` exits 0

### Typecheck

- [ ] `bun run typecheck` exits 0

## Additional Information

**Filtering in TypeScript vs. Obsidian JS:** The current `obEval` expressions often filter files server-side (e.g., only return notes in a specific folder). After this refactor, `listFiles` returns all vault files and commands filter the result in TypeScript. This is intentional: the port is simpler, the filter logic is testable without mocking Obsidian eval output, and the performance impact is negligible for typical vault sizes (<10 000 notes).

**`resolveVault` treatment:** `resolveVault()` from `src/lib/obsidian.ts` is NOT part of `VaultOps` — it is a vault metadata concern, not a vault I/O concern. It may keep its direct import from `src/lib/obsidian.ts` for now. A future story may move it to the registry lib if needed.

---

> **Blocks**:
>
> - STORY-058 ⛔ — Test migration story requires all command refactors complete
