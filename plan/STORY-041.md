---
title: 'Vault registry library and extractVaultFlag helper'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 5
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-041'
phase: 8
sequence: 1
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-038
blocks:
  - STORY-042
  - STORY-043
  - STORY-045
  - STORY-047
  - STORY-048
decisionGate: ~
validationBasis: 'bun test src/lib/__tests__/vault-registry.test.ts exits 0; all 12 assertions pass; registerVault rejects paths outside git root with descriptive error'
---

## Goal

Create `src/lib/vault-registry.ts` — the central data layer for multi-vault management.
The registry stores vault entries in `.nerv/vaults.json` at the git repo root.
All vault-management commands and `resolveVault()` read from this registry.
Ship a shared `extractVaultFlag()` helper that strips `--vault <name>` from any command's args array before positional parsing.

## Acceptance Criteria

### Core types and file location

- [ ] `VaultEntry` type exported: `{ name: string; path: string; isDefault?: boolean }`
- [ ] `VaultRegistry` type exported: `{ vaults: VaultEntry[] }`
- [ ] `findGitRoot(): Promise<string>` — shells `git rev-parse --show-toplevel` via `spawnCapture`; calls `logError('vault-registry: not inside a git repository')` if exit code is non-zero
- [ ] `registryPath(): Promise<string>` — returns `<gitRoot>/.nerv/vaults.json`

### Registry CRUD

- [ ] `readRegistry(): Promise<VaultRegistry>` — reads and parses `.nerv/vaults.json`; returns `{ vaults: [] }` when the file does not exist; calls `logError` on malformed JSON
- [ ] `writeRegistry(r: VaultRegistry): Promise<void>` — `mkdir -p <gitRoot>/.nerv` then writes formatted JSON (2-space indent) atomically
- [ ] `registerVault(name: string, path: string): Promise<void>`:
  - Resolves `path` to absolute via `node:path resolve()`
  - Calls `findGitRoot()` and checks `resolvedPath.startsWith(gitRoot + '/')` (or equals `gitRoot`); calls `logError('add-vault: path must be inside the git repository. Got: <path>')` if outside
  - Skips write (no-op, no error) when an entry with the same name and same resolved path already exists
  - Calls `logError('add-vault: vault "<name>" is already registered at a different path: <existing>')` if name exists with a different path
  - Appends entry to registry; sets `isDefault: true` on this entry when the registry was previously empty
  - Respects `NERV_SKIP_GIT_ROOT_CHECK=1` env variable — skips the git-root path validation (used only in test environments)
- [ ] `unregisterVault(name: string): Promise<void>` — removes entry; calls `logError('remove-vault: vault "<name>" is not registered')` if not found; if the removed entry was the default, clears `isDefault` (leaves no default — user must run `switch-vault` to set a new one)
- [ ] `lookupVault(name: string): Promise<VaultEntry>` — returns entry or calls `logError('No vault named "<name>" is registered. Run: nerv list-vaults')`
- [ ] `getDefaultVault(): Promise<VaultEntry | undefined>` — returns first entry with `isDefault: true`; returns `undefined` if none
- [ ] `setDefaultVault(name: string): Promise<void>` — reads registry, clears all `isDefault`, sets `isDefault: true` on named entry, writes registry; calls `logError` if name not found

### Shared flag parser

- [ ] `extractVaultFlag(args: string[]): { vault: string | undefined; rest: string[] }` exported from `vault-registry.ts`
- [ ] Scans `args` for `--vault` followed by a value; strips both tokens from the returned `rest` array
- [ ] Returns `{ vault: undefined, rest: args }` when no `--vault` flag is present
- [ ] Calls `logError('--vault flag requires a value')` when `--vault` appears as the last argument with no following value

### Unit tests (`src/lib/__tests__/vault-registry.test.ts`)

- [ ] `registerVault` adds an entry to the registry file
- [ ] `registerVault` is idempotent (same name + same path → no-op, no error)
- [ ] `registerVault` rejects a path outside the git root with a descriptive error message (use `NERV_SKIP_GIT_ROOT_CHECK=1` off to test the guard, and a temp dir outside the repo as the path)
- [ ] `registerVault` sets `isDefault: true` on the first vault registered
- [ ] `lookupVault` returns the correct entry
- [ ] `lookupVault` throws with an actionable message for an unregistered name
- [ ] `setDefaultVault` / `getDefaultVault` round-trip: set → read back → correct name
- [ ] `unregisterVault` removes the entry; subsequent `lookupVault` throws
- [ ] `unregisterVault` throws descriptive error for an unknown name
- [ ] `extractVaultFlag(['--vault', 'my-vault', 'other'])` returns `{ vault: 'my-vault', rest: ['other'] }`
- [ ] `extractVaultFlag(['other'])` returns `{ vault: undefined, rest: ['other'] }`
- [ ] `extractVaultFlag(['--vault'])` calls `logError`

## Additional Information

All tests use `Bun.env.TMPDIR ?? '/tmp'` as the scratch directory for temporary registry files.
Mock `findGitRoot()` in tests by pointing the registry path to the temp directory.
`NERV_SKIP_GIT_ROOT_CHECK=1` is only ever set in test environments — not in production code or CI integration runs.

> [!important]
> `registerVault` must use `resolve(path).startsWith(gitRoot + sep)` — appending the platform path separator before the `startsWith` check prevents a path like `/repo-extended/vault` from matching a gitRoot of `/repo`.
> Use `import { resolve, sep } from 'node:path'` and validate with `resolvedPath === gitRoot || resolvedPath.startsWith(gitRoot + sep)`.

## Security Considerations

| Area            | Risk                                             | Mitigation                                                                     |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Path traversal  | A crafted `path` argument could escape the repo  | `resolve()` + `startsWith(gitRoot + sep)` check rejects all traversal attempts |
| JSON injection  | Malicious vault names could corrupt the registry | `name` is stored as a JSON string value — `JSON.stringify` handles escaping    |
| Shell injection | `findGitRoot` passes no user input to the shell  | `spawnCapture` receives a fixed args array; no string interpolation            |

---

> **Blocks**:
>
> - STORY-042 ⛔ — Rewrite resolveVault() (needs lookupVault, getDefaultVault)
> - STORY-043 ⛔ — Rename init-vault to add-vault (needs registerVault, findGitRoot)
> - STORY-045 ⛔ — list-vaults command (needs readRegistry)
> - STORY-047 ⛔ — switch-vault command (needs setDefaultVault)
> - STORY-048 ⛔ — remove-vault command (needs unregisterVault)
