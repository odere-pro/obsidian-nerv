---
title: 'Implement ObsidianCliAdapter and VaultOps provider'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 5
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-051'
phase: 9
sequence: 2
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-050
blocks:
  - STORY-053
  - STORY-054
  - STORY-055
  - STORY-057
decisionGate: ~
validationBasis: 'bun test src/adapters/__tests__/obsidian-cli.unit.test.ts exits 0 (all 12 method unit tests pass with spawnCapture mocked); bun run typecheck exits 0; grep -rn "from.*lib/obsidian" src/adapters/obsidian-cli.ts shows only internal imports; grep -rn "getVaultOps\|setVaultOps" src/ports/provider.ts matches exports'
---

## Goal

Create `src/adapters/obsidian-cli.ts` implementing the `VaultOps` interface with the Obsidian CLI as the backend. Each of the 12 methods translates a domain-level vault operation into the Obsidian JS expression currently inlined across command files. Create `src/ports/provider.ts` as the lightweight factory that commands use to obtain a `VaultOps` instance — this is the dependency injection point. Tests override via `setVaultOps()` instead of `mock.module()`.

## Acceptance Criteria

### `src/adapters/obsidian-cli.ts`

- [ ] Exports class `ObsidianCliAdapter` implementing `VaultOps`
- [ ] Constructor takes no arguments; uses module-level `obEval`, `spawnCapture`, `encodeForJs`, `dailyAppend` from `src/lib/`
- [ ] Each method maps to the Obsidian expression listed below:

  | `VaultOps` method                           | Obsidian expression / CLI call                                                                                                                                                                                                   |
  | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `fileExists(vault, path)`                   | `obEval(vault, "app.vault.getAbstractFileByPath(${e(path)}) ? 'exists' : 'absent'")` → parse `=== 'exists'`                                                                                                                      |
  | `readFile(vault, path)`                     | `obEval(vault, "const f = app.vault.getAbstractFileByPath(${e(path)}); JSON.stringify({content: await app.vault.cachedRead(f), frontmatter: app.metadataCache.getFileCache(f)?.frontmatter ?? {}})")` → `parseJson<VaultFile>()` |
  | `createFile(vault, path, content)`          | `obEval(vault, "await app.vault.create(${e(path)}, ${e(content)})")`                                                                                                                                                             |
  | `updateFrontmatter(vault, path, mutations)` | `obEval(vault, "await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${e(path)}), fm => { const m = ${JSON.stringify(mutations)}; for (const k of Object.keys(m)) fm[k] = m[k]; })")`                        |
  | `listFiles(vault)`                          | `obEval(vault, "JSON.stringify(app.vault.getMarkdownFiles().map(f => ({path: f.path, frontmatter: app.metadataCache.getFileCache(f)?.frontmatter ?? {}})))")` → `parseJson<VaultFileEntry[]>()`                                  |
  | `appendToDaily(vault, content)`             | delegates to `dailyAppend(vault, content)` from `src/lib/obsidian.ts`                                                                                                                                                            |
  | `openDaily(vault)`                          | `spawnCapture(['obsidian', 'daily', \`vault=${vault}\`])`                                                                                                                                                                        |
  | `listRecentFiles(vault, limit, sort)`       | `spawnCapture(['obsidian', 'files', \`vault=${vault}\`, \`sort=${sort ?? 'modified'}\`, \`limit=${limit}\`, '--copy'])` → split stdout lines                                                                                     |
  | `listUnresolved(vault)`                     | `spawnCapture(['obsidian', 'unresolved', \`vault=${vault}\`])` → split stdout lines                                                                                                                                              |
  | `trashFile(vault, path)`                    | `obEval(vault, "await app.vault.trash(app.vault.getAbstractFileByPath(${e(path)}), false)")`                                                                                                                                     |
  | `appendToFile(vault, path, content)`        | `obEval(vault, "await app.vault.append(app.vault.getAbstractFileByPath(${e(path)}), ${e(content)})")`                                                                                                                            |
  | `replaceFileContent(vault, path, content)`  | `obEval(vault, "await app.vault.modify(app.vault.getAbstractFileByPath(${e(path)}), ${e(content)})")`                                                                                                                            |

  where `e(x)` is shorthand for `encodeForJs(x)`.

- [ ] `listFiles` returns the full vault listing with no filter parameter — callers filter the result in TypeScript. This keeps the Obsidian expression simple and testable.
- [ ] `readFile` throws (via `logError`) when `parseJson` returns null — the path does not exist or Obsidian returned malformed output
- [ ] All string values embedded in expressions pass through `encodeForJs()` — never concatenated raw

### `src/ports/provider.ts`

- [ ] Exports `getVaultOps(): VaultOps` — returns the singleton `ObsidianCliAdapter` instance by default
- [ ] Exports `setVaultOps(ops: VaultOps): void` — replaces the singleton; used in tests
- [ ] Exports `getDevOps(): DevOps` — stub only in this story (returns `ObsidianDevAdapter` once STORY-052 lands); implement as a TODO throw until STORY-052 is merged
- [ ] Exports `setDevOps(ops: DevOps): void`
- [ ] Module state is reset between tests: callers use `setVaultOps` in `beforeEach` and restore with `afterEach` (or use `afterAll`)

### Unit tests (`src/adapters/__tests__/obsidian-cli.unit.test.ts`)

- [ ] `mock.module('../../lib/obsidian', ...)` mocks `obEval` and `dailyAppend`; `mock.module('../../lib/shell', ...)` mocks `spawnCapture`
- [ ] `fileExists`: mocked `obEval` returns `'exists'` → method returns `true`; returns `'absent'` → returns `false`
- [ ] `readFile`: mocked `obEval` returns `JSON.stringify({content: 'body', frontmatter: {title: 'T'}})` → method returns `VaultFile` with matching fields
- [ ] `createFile`: verifies `obEval` called with expression containing `app.vault.create`
- [ ] `updateFrontmatter`: verifies `obEval` called with expression containing `processFrontMatter` and JSON-serialized mutations
- [ ] `listFiles`: mocked `obEval` returns JSON array → method returns typed `VaultFileEntry[]`
- [ ] `appendToDaily`: delegates to `dailyAppend` mock
- [ ] `openDaily`: `spawnCapture` called with `['obsidian', 'daily', 'vault=test-vault']`
- [ ] `listRecentFiles`: `spawnCapture` called with `limit` and `sort` args; stdout split into string array
- [ ] `listUnresolved`: `spawnCapture` called; stdout lines returned
- [ ] `trashFile`: `obEval` called with expression containing `app.vault.trash`
- [ ] `appendToFile`: `obEval` called with expression containing `app.vault.append`
- [ ] `replaceFileContent`: `obEval` called with expression containing `app.vault.modify`

### Typecheck

- [ ] `bun run typecheck` exits 0
- [ ] `ObsidianCliAdapter` satisfies the `VaultOps` interface — TypeScript structural check catches any missing or mistyped method

## Additional Information

**Import sourcing:** `ObsidianCliAdapter` imports `obEval`, `dailyAppend` from `src/lib/obsidian.ts` and `spawnCapture` from `src/lib/shell.ts`. Commands will import from `src/ports/provider.ts` only — they will no longer import from `src/lib/obsidian.ts` directly after STORY-053–056.

**`encodeForJs` shorthand:** Define a local `const e = encodeForJs` inside each method body or at the module level for readability. Do not re-export it.

**Provider singleton pattern:** The provider uses a module-level `let vaultOps: VaultOps = new ObsidianCliAdapter()`. `setVaultOps` replaces it. This is the simplest DI mechanism compatible with commands-as-functions (no class constructors to inject into). Tests call `setVaultOps(new MockVaultOps())` in `beforeEach`.

---

> **Blocks**:
>
> - STORY-053 ⛔ — Low-risk command refactor needs provider
> - STORY-054 ⛔ — Medium-risk command refactor needs provider
> - STORY-055 ⛔ — Complex command refactor needs provider
> - STORY-057 ⛔ — MockVaultOps needs ObsidianCliAdapter type to validate against
