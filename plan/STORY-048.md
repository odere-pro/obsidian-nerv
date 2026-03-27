---
title: 'Implement remove-vault command'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 2
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-048'
phase: 8
sequence: 3
parallelTrack: C
size: 'S — ~0.25 day'
dependsOn:
  - STORY-041
blocks:
  - STORY-049
decisionGate: ~
validationBasis: 'nerv remove-vault --vault my-vault --force removes entry from .nerv/vaults.json; without --force exits 1 with confirmation instruction; removing default vault prints warning that no default is set; nerv remove-vault --vault ghost --force exits 1 with descriptive error; bun test src/commands/__tests__/remove-vault.test.ts exits 0'
---

## Goal

Implement `src/commands/remove-vault.ts` to unregister a vault from `.nerv/vaults.json`.
`remove-vault` only removes the registry entry — it does NOT delete any vault files on disk.
The `--force` flag is required to prevent accidental removal.

## Acceptance Criteria

### Core behaviour

- [ ] Calls `extractVaultFlag(args)` to extract the `--vault <name>` value
- [ ] Requires `--force` flag; without it exits 1 with: `'remove-vault: --force is required to remove a vault registration.\nRun: nerv remove-vault --vault ${name} --force\n'`
- [ ] Calls `unregisterVault(name)` from `vault-registry.ts`
- [ ] Prints on success: `'==> Removed vault '${name}' from registry.\n    Files at ${entry.path} were NOT deleted.\n'`
- [ ] When the removed vault was the default (`isDefault: true`), appends: `'    Warning: no default vault is set. Run: nerv switch-vault --vault <name>\n'`
- [ ] Calls `logError('remove-vault: --vault <name> is required')` when `--vault` is absent
- [ ] `unregisterVault` handles the "not found" error — propagated as-is

### `--help`

- [ ] Prints: `'Usage: nerv remove-vault --vault <name> --force\n  Removes <name> from the vault registry. Does NOT delete vault files.\n  --force  Required to confirm the removal.\n'`

### Unit tests (`src/commands/__tests__/remove-vault.test.ts`)

- [ ] `run(['--vault', 'my-vault', '--force'])` with `my-vault` registered → `unregisterVault` called; success message printed
- [ ] `run(['--vault', 'my-vault'])` without `--force` → exits 1 with confirmation instruction
- [ ] `run([])` (no `--vault` flag) → `logError` called with message containing `'--vault'`
- [ ] `run(['--vault', 'ghost', '--force'])` with `ghost` not registered → `logError` from `unregisterVault` propagated
- [ ] Removing the default vault → success message includes the "no default vault" warning

## Additional Information

`remove-vault` is intentionally non-destructive on the filesystem — vault files remain intact.
This matches the principle of least surprise: deregistering a vault from nerv's index should not destroy work.

---

> **Blocks**:
>
> - STORY-049 ⛔ — CLI help update (must be registered in COMMANDS array)
