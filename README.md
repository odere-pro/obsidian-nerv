# obsidian-nerv

An agentic knowledge nervous system: a multi-vault Obsidian v11 framework wired to a macOS CLI skill layer for structured knowledge management.

## Status

| Story     | Title                                | Status                        |
| --------- | ------------------------------------ | ----------------------------- |
| STORY-001 | Bootstrap vault environment          | ✅ Complete                   |
| STORY-002 | Register CLI and verify manual setup | ⚠️ Partial — GUI steps remain |
| STORY-003 | Implement core library (lib.sh)      | 🔄 In progress                |

---

## bootstrap-vault.sh

Provisions a complete Obsidian vault in a single idempotent command.

### Usage

```bash
./bootstrap-vault.sh <vault-name> <vault-path>
```

### Examples

```bash
# Create a study vault
./bootstrap-vault.sh study ~/vaults/study

# Create a project vault
./bootstrap-vault.sh dev-projectA ~/vaults/dev-projectA

# Create a vault inside the repo docs folder
./bootstrap-vault.sh obsidian_docs ./docs/obsidian_docs
```

### What it provisions

| Area                | Details                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault directory     | Created at `<vault-path>` if it does not exist                                                                                                             |
| `.obsidian/` config | `app.json`, `core-plugins.json`, `templates.json`, `daily-notes.json`, `hotkeys.json`, `graph.json`, `workspace.json`, `workspaces.json`, `bookmarks.json` |
| Vault folders       | `_inbox/`, `_templates/`, `_scripts/`, `_scripts/cli/`, `_bases/`, `journals/daily/`, `projects/`                                                          |
| Templates           | 9 `.md` templates + `tpl-project.base` written to `_templates/`                                                                                            |
| Audit bases         | `audit-missing-properties.base`, `audit-drafts.base`, `audit-orphans.base` written to `_bases/`                                                            |
| Host CLI dirs       | `~/.ontology-cli/core/`, `~/.ontology-cli/agent/`, `~/.ontology-cli/study/`, `~/.ontology-cli/dev/`                                                        |
| PATH                | Export appended to `~/.zprofile` (skipped if already present)                                                                                              |
| Git                 | Initialized at vault root with `.gitignore` and an initial commit                                                                                          |

### Idempotency

Re-running on an existing vault is safe — every file write is guarded by an existence check. No existing files are modified.

```bash
# Safe to run again — exits 0 with no changes
./bootstrap-vault.sh study ~/vaults/study
```

### After running

Open the vault folder in Obsidian (**File → Open folder as vault**), then complete the manual setup steps below.

### Templates created

| File               | Type       | Purpose                     |
| ------------------ | ---------- | --------------------------- |
| `tpl-root.md`      | ROOT       | Top-level domain note       |
| `tpl-branch.md`    | BRANCH     | Sub-domain note             |
| `tpl-leaf.md`      | LEAF       | Atomic concept note         |
| `tpl-inbox.md`     | Inbox      | Capture and triage          |
| `tpl-daily.md`     | Daily note | Daily work log              |
| `tpl-ontology.md`  | ONTOLOGY   | Relationship type registry  |
| `tpl-vocab.md`     | VOCAB      | Domain vocabulary           |
| `tpl-topk.md`      | TOPK       | Top-K limits tracker        |
| `tpl-project.base` | Base       | Per-project query dashboard |

### Hotkeys configured

| Hotkey        | Action                   |
| ------------- | ------------------------ |
| `Alt+T`       | Insert template          |
| `Cmd+O`       | Quick switcher           |
| `Cmd+Shift+F` | Global search            |
| `Cmd+G`       | Open graph view          |
| `Alt+B`       | Open backlinks           |
| `Cmd+;`       | In-note search           |
| `Alt+C`       | Command palette          |
| `Alt+D`       | Go to today's daily note |
| `Alt+W`       | Open workspace switcher  |

### Requirements

- macOS (uses BSD `sed`, `zsh`, `git`)
- Bash 3.2+
- Git installed
- Obsidian ≥ 1.12.4

---

## Manual setup (STORY-002)

After running `bootstrap-vault.sh`, complete these steps in Obsidian. Steps marked ✅ have been verified programmatically via the CLI.

| Step | Action                                                                              | Status                        |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------- |
| 1    | Open vault in Obsidian                                                              | ✅ Done                       |
| 2    | Confirm Obsidian ≥ 1.12.4 at Settings → About                                       | ✅ Confirmed (1.12.7)         |
| 3    | Register CLI at Settings → General → Command line interface                         | ✅ Done                       |
| 4    | Verify all `.obsidian/` settings (Files & Links, Editor, Templates, Daily Notes)    | ✅ Verified via CLI           |
| 5    | Confirm all 18 core plugins enabled; File Recovery 5 min / 30 days                  | ✅ Verified and fixed via CLI |
| 6    | `Cmd+P` → Toggle backlinks in document                                              | ⬜ Manual                     |
| 7    | Build and save 3 workspaces: `ontology-work`, `ontology-review`, `ontology-explore` | ⬜ Manual                     |
| 8    | Create 3 bookmark groups: `Ontology/`, `Audit Queries/`, `Active Work/`             | ⬜ Manual                     |
| 9    | Open all `.base` files and confirm no parse errors                                  | ⬜ Manual                     |
| 10   | Press `Alt+W` and confirm workspace switcher shows all 3 workspaces                 | ⬜ Manual                     |

---

## CLI core library (`lib.sh`)

`~/.ontology-cli/core/lib.sh` provides shared functions sourced by every CLI skill.

```bash
source ~/.ontology-cli/core/lib.sh
```

### Functions

| Function        | Signature                                          | Description                                                   |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `ob_eval`       | `ob_eval <vault> <expr>`                           | Run JavaScript in a running Obsidian vault                    |
| `resolve_vault` | `resolve_vault <arg>`                              | Extract vault name from `vault=<name>` or return active vault |
| `daily_append`  | `daily_append <vault> <content>`                   | Append content to today's daily note                          |
| `log_error`     | `log_error <message>`                              | Write to stderr and exit 1                                    |
| `emit_json`     | `emit_json <data>`                                 | Write JSON to stdout                                          |
| `rollback_log`  | `rollback_log <vault> <operation> <partial_state>` | Append partial-failure entry to `_inbox/_rollback-log.md`     |

```bash
# Examples
ob_eval obsidian_docs "app.vault.getName()"
resolve_vault "vault=dev-projectA"
daily_append obsidian_docs "- Created [[MyNote]]"
rollback_log obsidian_docs "create-entity" "Note created but parent not updated"
emit_json '{"status":"ok","path":"projects/aws/AWS.ROOT.md"}'
```

> Requires Obsidian to be running for `ob_eval`, `daily_append`, and `rollback_log`.
