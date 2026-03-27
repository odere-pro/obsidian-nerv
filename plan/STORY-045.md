---
title: 'Implement list-vaults command'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 2
epic: 'EPIC-011 — Multi-Vault Management'
planKey: 'STORY-045'
phase: 8
sequence: 3
parallelTrack: C
size: 'S — ~0.25 day'
dependsOn:
  - STORY-041
blocks:
  - STORY-049
decisionGate: ~
validationBasis: 'nerv list-vaults prints aligned table with all registered vaults; (default) marker appears on correct vault; nerv list-vaults --json emits valid JSON array; empty registry prints "No vaults registered" message'
---

## Goal

Implement `src/commands/list-vaults.ts` to display all vaults registered in `.nerv/vaults.json` as an aligned table.
This is the operator's primary discovery tool — it answers "what vaults does this project know about?" at a glance.

## Acceptance Criteria

### Human-readable output

- [ ] Reads registry via `readRegistry()` from `vault-registry.ts`
- [ ] When registry is empty, prints: `'No vaults registered. Run: nerv add-vault --vault <name> --path <path>\n'` and exits 0
- [ ] When vaults are present, prints a column-aligned table with headers: `NAME`, `PATH`, `DEFAULT`
- [ ] `DEFAULT` column shows `yes` for the default vault, empty string for all others
- [ ] `NAME` column width is padded to the longest name in the registry
- [ ] `PATH` column shows the absolute path as stored in the registry
- [ ] Example output:
  ```
  NAME        PATH                              DEFAULT
  my-vault    /Users/me/git/project/my-vault    yes
  work-vault  /Users/me/git/project/work-vault
  ```

### JSON output (`--json` flag)

- [ ] `nerv list-vaults --json` emits a JSON array to stdout: `[{"name":"...","path":"...","isDefault":true|false}]`
- [ ] Empty registry emits `[]` (not an error)

### No vault flag required

- [ ] `list-vaults` does not accept or require `--vault <name>` — it operates on the whole registry
- [ ] `--help` / `-h` prints: `'Usage: nerv list-vaults [--json]\n'`

### Unit tests (`src/commands/__tests__/list-vaults.test.ts`)

- [ ] `run([])` with a two-vault registry prints the expected aligned table with `yes` on the default entry
- [ ] `run(['--json'])` emits a parseable JSON array with both vault entries
- [ ] `run([])` with an empty registry prints the "No vaults registered" message and exits 0

## Additional Information

`list-vaults` is a read-only command — it never writes to the registry.
Column alignment must use `String.padEnd()` based on the max name length — do not hard-code widths.

---

> **Blocks**:
>
> - STORY-049 ⛔ — CLI help update (must be registered in COMMANDS array)
