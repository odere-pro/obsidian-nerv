---
title: 'Update CLI help with new commands, vault flag, and env var'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 2
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-049'
phase: 8
sequence: 4
parallelTrack: A
size: 'S — ~0.25 day'
dependsOn:
  - STORY-043
  - STORY-044
  - STORY-045
  - STORY-046
  - STORY-047
  - STORY-048
blocks: []
decisionGate: ~
validationBasis: 'nerv --help output contains add-vault, list-vaults, current-vault, switch-vault, remove-vault; init-vault absent from --help; --vault flag and NERV_DEFAULT_VAULT documented in help output; nerv list-vaults --help prints command-specific usage; bun run typecheck exits 0'
---

## Goal

Update `src/cli.ts` to register the four new vault-management commands and `add-vault`, document the universal `--vault <name>` flag, and surface the `NERV_DEFAULT_VAULT` environment variable in `nerv --help` output.
Replace the `init-vault` entry in `COMMANDS` with `add-vault`.

## Acceptance Criteria

### COMMANDS array (`src/cli.ts`)

- [ ] `{ name: 'init-vault', ... }` entry removed
- [ ] `{ name: 'add-vault', description: 'Provision and register a new vault (idempotent)' }` added (preserving existing alphabetical-ish ordering or inserting near top with other vault commands)
- [ ] `{ name: 'list-vaults', description: 'List all registered vaults' }` added
- [ ] `{ name: 'current-vault', description: 'Show the vault that would be used by default' }` added
- [ ] `{ name: 'switch-vault', description: 'Set the default vault for all commands' }` added
- [ ] `{ name: 'remove-vault', description: 'Unregister a vault (does not delete files)' }` added

### `printHelp()` output (`src/cli.ts`)

- [ ] Existing command table format unchanged (name padded to max length + description)
- [ ] After the command table and `Run 'nerv <command> --help'` line, appends two new sections, separated by blank lines:

  ```
  Vault flag:
    --vault <name>  Override the active vault for any command

  Environment:
    NERV_DEFAULT_VAULT  Default vault name (must be registered via: nerv add-vault)
  ```

- [ ] `nerv --help` output does NOT contain `init-vault`

### Dynamic import path

- [ ] The `import('./commands/${subcommand}')` dispatcher in `main()` resolves `add-vault`, `list-vaults`, `current-vault`, `switch-vault`, `remove-vault` correctly — no change needed to the import mechanism since it uses the subcommand name directly

### Typecheck

- [ ] `bun run typecheck` exits 0 after all STORY-041 through STORY-048 changes are merged

### Smoke test (manual verification acceptable)

- [ ] `nerv --help` — all 5 new command names appear in the table
- [ ] `nerv add-vault --help` — prints add-vault usage
- [ ] `nerv list-vaults --help` — prints list-vaults usage
- [ ] `nerv current-vault --help` — prints current-vault usage
- [ ] `nerv switch-vault --help` — prints switch-vault usage
- [ ] `nerv remove-vault --help` — prints remove-vault usage
- [ ] `nerv init-vault` — prints `'nerv: unknown command 'init-vault''`

## Additional Information

This is the final integration story for the epic — it requires all prior stories to be complete before merging.
No new behaviour is introduced here; this story is purely an interface surface update.

---

> This story has no downstream blocks within EPIC-011.
