---
title: 'Implement switch-vault command'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 2
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-047'
phase: 8
sequence: 3
parallelTrack: C
size: 'S — ~0.25 day'
dependsOn:
  - STORY-041
blocks:
  - STORY-049
decisionGate: ~
validationBasis: 'nerv switch-vault --vault my-vault sets isDefault:true in .nerv/vaults.json; nerv current-vault shows my-vault after switch; nerv switch-vault --vault unregistered exits 1 with descriptive error; bun test src/commands/__tests__/switch-vault.test.ts exits 0'
---

## Goal

Implement `src/commands/switch-vault.ts` to set the default vault in the registry.
After running `nerv switch-vault --vault <name>`, all subsequent commands that omit `--vault` will target that vault.
This is the primary UX entry point for multi-vault workflows.

## Acceptance Criteria

### Core behaviour

- [ ] Calls `extractVaultFlag(args)` to extract the `--vault <name>` value
- [ ] Calls `setDefaultVault(name)` from `vault-registry.ts`
- [ ] Prints on success: `'==> Default vault set to '${name}'\n    Path: ${entry.path}\n'`
- [ ] Calls `logError('switch-vault: --vault <name> is required')` when `--vault` is absent
- [ ] `setDefaultVault` handles the "not registered" error — no additional guard needed in `switch-vault`

### `--help`

- [ ] Prints: `'Usage: nerv switch-vault --vault <name>\n  Sets <name> as the default vault for all commands.\n  <name> must already be registered. Run: nerv list-vaults\n'`

### Unit tests (`src/commands/__tests__/switch-vault.test.ts`)

- [ ] `run(['--vault', 'my-vault'])` with `my-vault` registered → `setDefaultVault` called with `'my-vault'`; success message printed
- [ ] `run([])` (no `--vault` flag) → `logError` called with a message containing `'--vault'`
- [ ] `run(['--vault', 'ghost'])` with `ghost` not registered → `logError` called (propagated from `setDefaultVault`)

## Additional Information

`switch-vault` does NOT create or provision a vault — it only changes which existing registered vault is the default.
To create and register a new vault, the operator uses `nerv add-vault`.

---

> **Blocks**:
>
> - STORY-049 ⛔ — CLI help update (must be registered in COMMANDS array)
