---
title: 'Refactor dev commands to DevOps and VaultOps ports'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 2
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-056'
phase: 9
sequence: 3
parallelTrack: B
size: 'S — ~0.25 day'
dependsOn:
  - STORY-052
blocks:
  - STORY-058
decisionGate: ~
validationBasis: 'grep -rn "from.*lib/obsidian" src/commands/dev/adr.ts src/commands/dev/code-link.ts returns zero matches (excluding resolveVault); bun test exits 0 for both dev command test files; bun run typecheck exits 0'
---

## Goal

Replace direct `obEval` calls in `dev/adr.ts` and `dev/code-link.ts` with `VaultOps` port calls. Both commands perform frontmatter patches and file reads — straightforward substitutions using `ops.readFile` and `ops.updateFrontmatter`. Note: `dev/dev-cycle.ts` was already refactored to use `DevOps` in STORY-052; this story completes the dev command group by handling the remaining two files.

**Commands in scope:** `dev/adr.ts`, `dev/code-link.ts`.

## Acceptance Criteria

### `dev/adr.ts`

- [ ] `const ops = getVaultOps()` at the top of `run()`
- [ ] ADR note read: `await ops.readFile(vault, adrPath)` replaces the `obEval` that fetches ADR content + frontmatter
- [ ] Frontmatter patch (status, superseded-by, date fields): `await ops.updateFrontmatter(vault, adrPath, mutations)` replaces the `obEval` that calls `processFrontMatter`
- [ ] Content section patch (if any): `await ops.replaceFileContent(vault, adrPath, newContent)` replaces the `obEval` that calls `app.vault.modify`
- [ ] Direct `import { obEval } from '../../lib/obsidian'` removed

### `dev/code-link.ts`

- [ ] `const ops = getVaultOps()` at the top of `run()`
- [ ] Note lookup: `await ops.listFiles(vault)` + TypeScript filter replaces the `obEval` that searches for a note by slug or title
- [ ] Link property write: `await ops.updateFrontmatter(vault, notePath, { codeLink: sourceRef })` replaces the `obEval` that calls `processFrontMatter`
- [ ] Direct `import { obEval } from '../../lib/obsidian'` removed

### Existing tests (both dev command test files)

- [ ] `mock.module('../../lib/obsidian', ...)` blocks replaced with `setVaultOps(inlineMockOps)` in `beforeEach`
- [ ] `dev/adr.ts` test: inline mock stubs `readFile` → returns ADR note; `updateFrontmatter` → no-op; `replaceFileContent` → no-op
- [ ] `dev/code-link.ts` test: inline mock stubs `listFiles` → returns vault notes; `updateFrontmatter` → no-op
- [ ] `bun test src/commands/__tests__/dev/adr.test.ts` exits 0
- [ ] `bun test src/commands/__tests__/dev/code-link.test.ts` exits 0

### Final check: zero `lib/obsidian` imports in commands

- [ ] After STORY-053, STORY-054, STORY-055, and this story are merged: `grep -rn "from.*lib/obsidian" src/commands/` matches ONLY `resolveVault` imports — no `obEval`, `dailyAppend`, or `rollbackLog` direct imports remain in any command file

### Typecheck

- [ ] `bun run typecheck` exits 0

## Additional Information

**`resolveVault` exception:** `resolveVault` is not part of `VaultOps` — it is a registry lookup, not a vault I/O operation. All command files may continue importing `resolveVault` directly from `src/lib/obsidian.ts`. The final grep check explicitly excludes `resolveVault` from what counts as a violation.

**Scope:** `dev/dev-cycle.ts` was already refactored in STORY-052 and is not touched here.

---

> **Blocks**:
>
> - STORY-058 ⛔ — Test migration story requires all command refactors complete
