---
title: 'Rewrite resolveVault() with registry-backed resolution'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 3
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-042'
phase: 8
sequence: 2
parallelTrack: A
size: 'S — ~0.25 day'
dependsOn:
  - STORY-041
blocks:
  - STORY-043
  - STORY-044
  - STORY-046
decisionGate: ~
validationBasis: 'bun test src/lib/__tests__/obsidian.test.ts exits 0; resolveVault throws with actionable error when no vault resolvable; NERV_DEFAULT_VAULT env override tested; existing unit tests that mock resolveVault continue to pass'
---

## Goal

Replace the existing `resolveVault()` implementation in `src/lib/obsidian.ts` with a registry-backed version.
The new implementation resolves the active vault from four sources in priority order: explicit `--vault` flag value → `NERV_DEFAULT_VAULT` env variable → registry default → hard error.
Remove the `obsidian vault` shell fallback (which required Obsidian to be running) and the `vault=<name>` positional prefix convention entirely.

## Acceptance Criteria

### Resolution order

- [ ] **Priority 1 — explicit arg**: when `resolveVault(arg)` is called with a non-empty string, calls `lookupVault(arg)` from `vault-registry.ts`; validates that the vault's path exists on disk via `Bun.file(entry.path).exists()`; returns the vault name on success
- [ ] **Priority 2 — env variable**: when `arg` is absent or empty, checks `Bun.env.NERV_DEFAULT_VAULT`; if set, calls `lookupVault(Bun.env.NERV_DEFAULT_VAULT)` with the same disk-existence check; returns the vault name
- [ ] **Priority 3 — registry default**: when env variable is also absent, calls `getDefaultVault()`; if an entry is returned, applies disk-existence check; returns the vault name
- [ ] **Priority 4 — error**: when all three sources yield nothing, calls `logError` with exactly: `'No vault specified. Pass --vault <name>, set NERV_DEFAULT_VAULT, or run: nerv switch-vault <name>'`

### Disk-existence validation

- [ ] When a vault is resolved from any source but its `path` does not exist on disk, calls `logError` with: `'Vault "<name>" is registered but its path does not exist: <path>. Run: nerv add-vault --vault <name> --path <path>'`

### Removed behaviours

- [ ] The `vault=<name>` prefix parsing (`arg.startsWith('vault=')`) is removed
- [ ] The `obsidian vault` shell fallback is removed — `resolveVault` no longer calls any external process as a fallback

### Updated signature

- [ ] `resolveVault(vault?: string): Promise<string>` — unchanged signature; callers already pass the extracted `--vault` value or `undefined`

### Tests

- [ ] `resolveVault('my-vault')` with `my-vault` registered and path on disk → returns `'my-vault'`
- [ ] `resolveVault('my-vault')` with `my-vault` not in registry → `logError` called with message containing the vault name
- [ ] `resolveVault('my-vault')` with `my-vault` registered but path missing from disk → `logError` with path in message
- [ ] `resolveVault(undefined)` with `NERV_DEFAULT_VAULT=my-vault` set and vault registered → returns `'my-vault'`
- [ ] `resolveVault(undefined)` with no env and registry default set → returns default vault name
- [ ] `resolveVault(undefined)` with no env and no registry default → `logError` with actionable message

## Additional Information

`obEval()` and `dailyAppend()` calls downstream of `resolveVault()` continue to use the vault name string — no changes needed in those functions.
Commands that previously used `vault=<name>` as a positional arg will fail with "vault not registered" after this migration until STORY-044 updates them to use `extractVaultFlag()` — implement STORY-042 and STORY-044 together in the same PR to avoid a broken intermediate state.

> [!important]
> The `vault=<name>` convention is used in ~17 command `run()` functions. Merging STORY-042 without STORY-044 will break all commands that currently pass `args[0]` as `vault=<name>` to `resolveVault`. Schedule both stories in the same sprint and ship them together.

## Security Considerations

| Area              | Risk                                                     | Mitigation                                                                                                          |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Untrusted env var | `NERV_DEFAULT_VAULT` could be set to an arbitrary string | Value is looked up in the registry via `lookupVault()` — unregistered names cause a hard error, not silent fallback |
| Path disclosure   | Disk-existence error message includes the vault path     | Acceptable: the path was registered by the same user who owns the machine                                           |

---

> **Blocks**:
>
> - STORY-043 ⛔ — Rename init-vault to add-vault (add-vault uses the new resolveVault indirectly)
> - STORY-044 ⛔ — Update all commands --vault flag (commands pass extracted vault to new resolveVault)
> - STORY-046 ⛔ — current-vault command (uses resolveVault in non-error mode)
