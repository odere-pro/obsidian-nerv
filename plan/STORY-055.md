---
title: 'Refactor complex orchestration commands to VaultOps port'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-055'
phase: 9
sequence: 5
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-051
blocks:
  - STORY-058
decisionGate: ~
validationBasis: 'grep -rn "from.*lib/obsidian" src/commands/morning.ts src/commands/explain-topic.ts src/commands/web-ingest/add.ts src/commands/web-ingest/batch.ts src/commands/web-ingest/monitor.ts returns zero matches (excluding resolveVault); bun test exits 0 for all five command test files; bun run typecheck exits 0'
---

## Goal

Replace direct `obEval`, `dailyAppend`, and `spawnCapture` calls in the five complex orchestration commands with `VaultOps` port calls. These commands are higher-risk because they compose multiple I/O operations across different vault paths, some with conditional branching and state persistence. The refactor must not alter any observable behaviour — same inputs, same vault mutations, same stdout/stderr output.

**Commands in scope:** `morning.ts`, `explain-topic.ts`, `web-ingest/add.ts`, `web-ingest/batch.ts`, `web-ingest/monitor.ts`.

## Acceptance Criteria

### `morning.ts`

- [ ] `const ops = getVaultOps()` at the top of `run()`
- [ ] `ops.openDaily(vault)` replaces `spawnCapture(['obsidian', 'daily', ...])` call
- [ ] `ops.listRecentFiles(vault, 10, 'modified')` replaces `spawnCapture(['obsidian', 'files', ...])` call
- [ ] `ops.listUnresolved(vault)` replaces `spawnCapture(['obsidian', 'unresolved', ...])` call
- [ ] Any `obEval` for vault stats (e.g., inbox item count) replaced with `await ops.listFiles(vault)` + TypeScript filter for `_inbox/` prefix
- [ ] `ops.appendToDaily(vault, content)` replaces the `dailyAppend(vault, content)` call for the morning summary line
- [ ] Direct `spawnCapture` import from `src/lib/shell.ts` removed — all subprocess calls go through `ops`

### `explain-topic.ts`

- [ ] `ops.listFiles(vault)` replaces the `obEval` that fetches all notes for context assembly
- [ ] Notes filtered and ranked in TypeScript — no JS expression needed for the filter
- [ ] Any individual note full-text reads use `ops.readFile(vault, path)`

### `web-ingest/add.ts`

- [ ] Idempotency check: `await ops.listFiles(vault)` + TypeScript filter for `url:` frontmatter match replaces the `obEval` search
- [ ] Content section patch: `await ops.replaceFileContent(vault, path, newContent)` replaces the `obEval` that calls `app.vault.modify`
- [ ] Frontmatter patch (url, source_title, source_date): `await ops.updateFrontmatter(vault, path, { url, source_title, source_date })` replaces the `processFrontMatter` eval
- [ ] Parent connections section update: `await ops.appendToFile(vault, parentPath, connectionLine)` replaces the append eval
- [ ] Daily log: `await ops.appendToDaily(vault, logLine)` replaces `dailyAppend` call
- [ ] `createEntity` inner call unchanged — it will use `ops` after STORY-054 lands; no double-refactor needed here since `web-ingest/add.ts` calls `createEntity()` as a function, not via eval

### `web-ingest/batch.ts`

- [ ] No direct `obEval` calls expected in this file (it delegates to `ingestUrl` from `add.ts`) — verify and confirm zero direct lib/obsidian imports
- [ ] If any direct `obEval` or `spawnCapture` calls exist, replace with `ops` calls
- [ ] `bun test src/commands/__tests__/web-ingest/batch.test.ts` exits 0

### `web-ingest/monitor.ts`

- [ ] State persistence read: `await ops.readFile(vault, monitorStatePath)` replaces the `obEval` that reads the monitor state note
- [ ] State persistence write: `await ops.updateFrontmatter(vault, monitorStatePath, stateUpdate)` replaces the `obEval` that writes state
- [ ] If the state note does not exist on first run: `await ops.createFile(vault, monitorStatePath, initialContent)` replaces the `obEval` create

### Existing tests (all 5 command test files)

- [ ] `mock.module('../../lib/obsidian', ...)` and `mock.module('../../lib/shell', ...)` blocks replaced with `setVaultOps(inlineMockOps)` in `beforeEach`
- [ ] `morning.ts` test: inline mock stubs `listRecentFiles` → returns 3 file paths; `listUnresolved` → returns 1 path; `listFiles` → returns inbox count; `openDaily` and `appendToDaily` are no-ops
- [ ] `explain-topic.ts` test: inline mock stubs `listFiles` and `readFile`
- [ ] `web-ingest/add.ts` test: inline mock stubs `listFiles` (idempotency), `createFile`, `updateFrontmatter`, `replaceFileContent`, `appendToFile`, `appendToDaily`
- [ ] `web-ingest/monitor.ts` test: inline mock stubs `readFile`, `updateFrontmatter`, `createFile`
- [ ] All existing test assertions (output content, call counts, error paths) remain unchanged
- [ ] `bun test` exits 0 for all 5 test files

### Typecheck

- [ ] `bun run typecheck` exits 0
- [ ] No direct `import { spawnCapture }` from `../lib/shell` remains in any of the 5 command files

## Additional Information

**`morning.ts` uses `spawnCapture` directly:** Unlike other commands that route through `obEval`, `morning.ts` also calls `spawnCapture` directly for `obsidian daily`, `obsidian files`, and `obsidian unresolved`. These map to `ops.openDaily`, `ops.listRecentFiles`, and `ops.listUnresolved` respectively. After this story, `morning.ts` has zero direct subprocess calls.

**`web-ingest/add.ts` compound operation:** This command does create → patch frontmatter → patch content → append connections → daily log in sequence. The refactor introduces more granular port calls (one per logical step) rather than combining them. This improves testability: each step can be independently stubbed and asserted.

**`web-ingest/batch.ts` may be a no-op:** If `batch.ts` is a thin orchestrator that delegates entirely to `ingestUrl()` from `add.ts`, there may be nothing to change. Confirm by inspection before starting.

---

> **Blocks**:
>
> - STORY-058 ⛔ — Test migration story requires all command refactors complete
