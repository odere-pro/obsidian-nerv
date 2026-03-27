---
title: 'Define VaultOps and DevOps port interfaces'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 2
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-050'
phase: 9
sequence: 1
parallelTrack: A
size: 'S — ~0.25 day'
dependsOn: []
blocks:
  - STORY-051
  - STORY-052
  - STORY-057
decisionGate: ~
validationBasis: 'bun run typecheck exits 0; grep -r "VaultOps" src/ports/vault-ops.ts matches the interface declaration; grep -r "DevOps" src/ports/dev-ops.ts matches the interface declaration; no any types present in either file'
---

## Goal

Create the `src/ports/` directory with two TypeScript interfaces that establish the boundary between command logic and any vault backend implementation. `VaultOps` captures all vault I/O operations currently embedded as Obsidian JS expressions inside command files. `DevOps` captures the plugin-development operations that are Obsidian-specific with no realistic alternative backend. This story defines the contract only — no implementations.

The port pattern makes the Obsidian CLI a pluggable dependency: when the CLI API changes, only the adapter changes; commands stay untouched. Tests get an in-memory double rather than Obsidian mock chains.

## Acceptance Criteria

### `src/ports/vault-ops.ts`

- [ ] Exports `VaultFile` interface: `{ path: string; content: string; frontmatter: Record<string, unknown> }`
- [ ] Exports `VaultFileEntry` interface: `{ path: string; frontmatter: Record<string, unknown> }`
- [ ] Exports `VaultOps` interface with exactly 12 methods, all returning `Promise`:

  | Method               | Signature                                                                          |
  | -------------------- | ---------------------------------------------------------------------------------- |
  | `fileExists`         | `(vault: string, path: string): Promise<boolean>`                                  |
  | `readFile`           | `(vault: string, path: string): Promise<VaultFile>`                                |
  | `createFile`         | `(vault: string, path: string, content: string): Promise<void>`                    |
  | `updateFrontmatter`  | `(vault: string, path: string, mutations: Record<string, unknown>): Promise<void>` |
  | `listFiles`          | `(vault: string): Promise<VaultFileEntry[]>`                                       |
  | `appendToDaily`      | `(vault: string, content: string): Promise<void>`                                  |
  | `openDaily`          | `(vault: string): Promise<void>`                                                   |
  | `listRecentFiles`    | `(vault: string, limit: number, sort?: string): Promise<string[]>`                 |
  | `listUnresolved`     | `(vault: string): Promise<string[]>`                                               |
  | `trashFile`          | `(vault: string, path: string): Promise<void>`                                     |
  | `appendToFile`       | `(vault: string, path: string, content: string): Promise<void>`                    |
  | `replaceFileContent` | `(vault: string, path: string, content: string): Promise<void>`                    |

- [ ] `updateFrontmatter` accepts `mutations: Record<string, unknown>` — NOT an Obsidian `processFrontMatter` callback. The adapter translates to callback internally; the port is backend-agnostic.
- [ ] No `import` statements from `src/lib/` — the port must not know about any implementation

### `src/ports/dev-ops.ts`

- [ ] Exports `DevOps` interface with exactly 4 methods:

  | Method              | Signature                                          |
  | ------------------- | -------------------------------------------------- |
  | `reloadPlugin`      | `(vault: string, pluginId: string): Promise<void>` |
  | `captureErrors`     | `(vault: string): Promise<string>`                 |
  | `captureConsole`    | `(vault: string): Promise<string>`                 |
  | `captureScreenshot` | `(vault: string): Promise<string>`                 |

- [ ] No `import` statements from `src/lib/`

### Typecheck

- [ ] `bun run typecheck` exits 0 with both files present
- [ ] No `any` types in either file — all parameters and return types are explicit
- [ ] Both interfaces are exported at the top level (not `export default`)

## Additional Information

**Why `updateFrontmatter` uses a mutations object, not a callback:**
Obsidian's `app.fileManager.processFrontMatter` takes a callback `(fm) => void`. Exposing a callback on the port would leak Obsidian's mutation model into commands, making it impossible to implement an alternative backend (e.g., direct YAML parse + write). A `Record<string, unknown>` mutations map is serializable, diffable, and backend-neutral. The adapter applies each key-value pair inside the callback.

**Why `DevOps` is a separate interface:**
Plugin reload and dev capture have no realistic non-Obsidian alternative. Separating DevOps prevents commands from accidentally depending on dev operations and keeps the `VaultOps` interface focused on general vault I/O.

**Scope boundary:**
The `defuddle` dependency (`src/lib/defuddle.ts`) is outside this epic's scope. Only Obsidian CLI operations are ported here.

---

> **Blocks**:
>
> - STORY-051 ⛔ — ObsidianCliAdapter requires VaultOps to implement
> - STORY-052 ⛔ — ObsidianDevAdapter requires DevOps to implement
> - STORY-057 ⛔ — MockVaultOps requires VaultOps interface
