---
title: 'Implement current-vault command'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 2
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-046'
phase: 8
sequence: 3
parallelTrack: C
size: 'S — ~0.25 day'
dependsOn:
  - STORY-042
blocks:
  - STORY-049
decisionGate: ~
validationBasis: 'nerv current-vault prints the vault name that resolveVault() would use; source label (flag/env/default/none) appears in output; nerv current-vault --json emits {"vault":null,"source":"none"} when nothing is configured; exits 0 in all cases'
---

## Goal

Implement `src/commands/current-vault.ts` to show which vault would be resolved for the next command invocation, and why.
Unlike all other commands, `current-vault` never errors — it always exits 0 and reports the resolution state so operators can diagnose vault-selection problems without running a live command.

## Acceptance Criteria

### Resolution introspection (never calls `resolveVault()` — implements its own non-throwing version)

- [ ] Checks `Bun.env.NERV_DEFAULT_VAULT`: if set and registered, reports source `env`
- [ ] Falls back to `getDefaultVault()`: if an entry exists, reports source `default`
- [ ] When neither is set, reports `vault: none` and source `none`
- [ ] Does NOT error in any of the above cases — always exits 0

### Human-readable output

- [ ] When a vault is resolved: `'Current vault: <name>\n  Path:   <path>\n  Source: <source>  (<NERV_DEFAULT_VAULT|registry default|none>)\n'`
- [ ] When no vault can be resolved:

  ```
  Current vault: (none)
    Source: none

  To configure a vault:
    nerv add-vault --vault <name> --path <path>   — provision and register a new vault
    nerv switch-vault --vault <name>              — set an existing vault as default
    export NERV_DEFAULT_VAULT=<name>              — override via environment variable
  ```

### JSON output (`--json` flag)

- [ ] `nerv current-vault --json` emits: `{"vault":"<name>","path":"<path>","source":"env|default|none"}` or `{"vault":null,"path":null,"source":"none"}` when nothing configured

### `--vault` override

- [ ] `nerv current-vault --vault my-vault` reports that specific vault (from the registry), regardless of env or default — useful for verifying that a specific vault is correctly registered and reachable
- [ ] If `--vault my-vault` is passed and the vault is not registered, prints: `'Vault "my-vault" is not registered. Run: nerv list-vaults\n'` and exits 0 (not 1 — current-vault never errors)

### Unit tests (`src/commands/__tests__/current-vault.test.ts`)

- [ ] `run([])` with `NERV_DEFAULT_VAULT` set and vault registered → prints `env` source
- [ ] `run([])` with no env and registry default set → prints `default` source
- [ ] `run([])` with nothing configured → prints the "no vault" help block
- [ ] `run(['--json'])` with a registered default → emits parseable JSON with correct `source`
- [ ] `run(['--vault', 'my-vault'])` with vault registered → shows that vault and its path

## Additional Information

`current-vault` intentionally never calls `logError()`; it is diagnosis-safe.
The "source" label maps to: `env` (from `NERV_DEFAULT_VAULT`), `default` (from registry `isDefault: true`), `none`.

---

> **Blocks**:
>
> - STORY-049 ⛔ — CLI help update (must be registered in COMMANDS array)
