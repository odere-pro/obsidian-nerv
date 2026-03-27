---
title: 'Implement ObsidianDevAdapter and fix dev-cycle subprocess'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 2
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-052'
phase: 9
sequence: 2
parallelTrack: B
size: 'S — ~0.25 day'
dependsOn:
  - STORY-050
blocks:
  - STORY-056
decisionGate: ~
validationBasis: 'grep -rn "spawnSync\|child_process" src/ returns zero matches; bun test src/adapters/__tests__/obsidian-dev.unit.test.ts exits 0; bun run typecheck exits 0; ObsidianDevAdapter satisfies DevOps interface'
---

## Goal

Create `src/adapters/obsidian-dev.ts` implementing the `DevOps` interface using `spawnCapture`. Fix the outstanding `spawnSync` inconsistency in `src/commands/dev/dev-cycle.ts` — that file bypasses `src/lib/shell.ts`, uses `child_process.spawnSync` directly, has no timeout protection, and produces inconsistent error handling. After this story, `child_process` has zero references in `src/`.

Wire `ObsidianDevAdapter` into `src/ports/provider.ts` to replace the TODO stub left by STORY-051.

## Acceptance Criteria

### `src/adapters/obsidian-dev.ts`

- [ ] Exports class `ObsidianDevAdapter` implementing `DevOps`
- [ ] `reloadPlugin(vault, pluginId)` → `spawnCapture(['obsidian', 'plugin:reload', \`vault=${vault}\`, \`plugin=${pluginId}\`])`— exits if`exitCode !== 0`
- [ ] `captureErrors(vault)` → `spawnCapture(['obsidian', 'dev:errors', \`vault=${vault}\`])`→ returns`stdout`
- [ ] `captureConsole(vault)` → `spawnCapture(['obsidian', 'dev:console', \`vault=${vault}\`])`→ returns`stdout`
- [ ] `captureScreenshot(vault)` → `spawnCapture(['obsidian', 'dev:screenshot', \`vault=${vault}\`])`→ returns`stdout` (path or base64 per CLI output)
- [ ] All 4 methods use `spawnCapture` from `src/lib/shell.ts` — no `child_process` import

### `src/ports/provider.ts` update

- [ ] `getDevOps()` returns `new ObsidianDevAdapter()` singleton (replaces TODO stub from STORY-051)
- [ ] `setDevOps(ops: DevOps)` replaces the singleton for tests

### `src/commands/dev/dev-cycle.ts` fix

- [ ] All 4 `spawnSync` calls replaced with `await spawnCapture(...)` calls via `getDevOps()`:
  - `plugin:reload` → `devOps.reloadPlugin(vault, pluginId)`
  - `dev:errors` → `devOps.captureErrors(vault)`
  - `dev:console` → `devOps.captureConsole(vault)`
  - `dev:screenshot` → `devOps.captureScreenshot(vault)`
- [ ] `import { spawnSync } from 'child_process'` removed
- [ ] `run()` function is now `async`
- [ ] Error handling uses the same path as all other commands (exit code from `spawnCapture`, `logError` on failure)

### Unit tests (`src/adapters/__tests__/obsidian-dev.unit.test.ts`)

- [ ] `mock.module('../../lib/shell', ...)` mocks `spawnCapture`
- [ ] `reloadPlugin`: `spawnCapture` called with `['obsidian', 'plugin:reload', 'vault=v', 'plugin=my-plugin']`
- [ ] `captureErrors`: `spawnCapture` called; stdout returned
- [ ] `captureConsole`: `spawnCapture` called; stdout returned
- [ ] `captureScreenshot`: `spawnCapture` called; stdout returned
- [ ] Non-zero exit code from `spawnCapture` → `logError` called (spy on `process.exit`)

### No `child_process` remaining

- [ ] `grep -rn "child_process" src/` returns zero matches after this story

## Additional Information

**Why `dev-cycle.ts` used `spawnSync`:** It was an outlier implemented before the `spawnCapture` standard was established. It also ran synchronously, blocking the event loop during potentially long screenshot or console capture operations. The async fix resolves both the coupling and the blocking behaviour.

**`run()` becoming async:** Downstream callers (`src/cli.ts`) already `await` command `run()` functions, so making `dev-cycle.ts` async is compatible.

---

> **Blocks**:
>
> - STORY-056 ⛔ — Dev command refactor depends on DevOps adapter and fixed dev-cycle
