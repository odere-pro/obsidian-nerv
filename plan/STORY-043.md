---
title: 'Rename init-vault to add-vault and register vaults in registry'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 3
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-043'
phase: 8
sequence: 3
parallelTrack: A
size: 'S — ~0.25 day'
dependsOn:
  - STORY-041
  - STORY-042
blocks:
  - STORY-049
decisionGate: ~
validationBasis: 'nerv add-vault --vault my-vault --path <inside-repo> provisions vault and writes .nerv/vaults.json; nerv add-vault --vault bad --path /tmp/outside exits 1 with path error; bun test tests/integration/motor/add-vault.integration.test.ts exits 0; nerv init-vault exits 1 with "unknown command" message'
---

## Goal

Rename `src/commands/init-vault.ts` to `src/commands/add-vault.ts` and update its CLI adapter to:

- Accept `--vault <name>` instead of `--name <name>` (aligning with the universal `--vault` convention)
- Validate that the target path is physically inside the git root before provisioning
- Register the vault in `.nerv/vaults.json` after successful provisioning

All named exports (`VAULT_DIRS`, `buildVaultFileMap`, `initVault`, `deployAgentFiles`) remain unchanged so unit tests continue to compile without modification.

## Acceptance Criteria

### File rename

- [ ] `src/commands/init-vault.ts` renamed to `src/commands/add-vault.ts`
- [ ] `command.name` updated to `'add-vault'`
- [ ] `command.description` updated to `'Provision and register a new vault (idempotent)'`
- [ ] All named exports (`VAULT_DIRS`, `buildVaultFileMap`, `initVault`, `deployAgentFiles`) remain exported from the new file path

### Flag change

- [ ] `--name <name>` flag replaced by `--vault <name>` in the `run()` adapter; use `extractVaultFlag(args)` from `vault-registry.ts` to extract the name
- [ ] `--path <path>` flag unchanged
- [ ] `--help` usage string updated to: `Usage: nerv add-vault --vault <name> [--path <path>]\n  --vault  Vault name (required)\n  --path   Vault root directory (default: ./docs/vaults)\n`
- [ ] Missing `--vault` value exits 1 with: `'add-vault: --vault <name> is required\nUsage: nerv add-vault --vault <name> [--path <path>]\n'`

### Git-root path guard

- [ ] Before calling `initVault()`, calls `findGitRoot()` and validates that `resolve(vaultPath)` is equal to or starts with `gitRoot + sep`
- [ ] Exits 1 with error when path is outside: `'add-vault: vault path must be inside the git repository.\n  Git root: <gitRoot>\n  Given:    <resolvedPath>\n'`
- [ ] Respects `NERV_SKIP_GIT_ROOT_CHECK=1` (skips the guard — test environments only)

### Registry integration

- [ ] After a successful `deployAgentFiles()` call, calls `registerVault(name, resolve(vaultPath))` from `vault-registry.ts`
- [ ] On first `add-vault` invocation (empty registry), `registerVault` sets `isDefault: true` on the new entry automatically (handled by `registerVault` — no extra logic needed in `add-vault`)
- [ ] Idempotency preserved: re-running `add-vault` on an existing vault skips file writes (existing behaviour) and also skips the `registerVault` no-op (same name + same path)
- [ ] Prints `'==> Registered vault '${name}' in .nerv/vaults.json\n'` after registration

### Remove old command entry point

- [ ] `src/commands/init-vault.ts` no longer exists in the repository
- [ ] `nerv init-vault` exits 1 with `"nerv: unknown command 'init-vault'"` (handled by cli.ts dispatcher — no extra work needed after updating COMMANDS in STORY-049)

### Integration test update

- [ ] `tests/integration/motor/init-vault.integration.test.ts` renamed to `tests/integration/motor/add-vault.integration.test.ts`
- [ ] Import path updated from `'../../../src/commands/init-vault'` to `'../../../src/commands/add-vault'`
- [ ] New test added: `'registers vault in .nerv/vaults.json after provisioning'`
  - Reads `<VAULT_PATH>/../.nerv/vaults.json` (registry lives at git root, not inside the vault)
  - Parses JSON; verifies `vaults` array contains an entry with `name === VAULT_NAME`
  - Uses `NERV_SKIP_GIT_ROOT_CHECK=1` env flag so the integration test environment (where vault is at `./docs/vaults`) does not fail the git-root guard
- [ ] All previously passing integration test assertions continue to pass

## Additional Information

The pure functions `initVault()` and `buildVaultFileMap()` are not changed — they remain the unit-testable core of vault provisioning. Only the `run()` CLI adapter is modified.

> [!important]
> Rename the file with `git mv src/commands/init-vault.ts src/commands/add-vault.ts` to preserve git history.
> Do NOT delete and recreate — history loss makes blame and bisect harder.

---

> **Blocks**:
>
> - STORY-049 ⛔ — CLI help update (COMMANDS array must reference `add-vault`, not `init-vault`)
