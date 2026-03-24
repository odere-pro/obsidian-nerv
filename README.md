# obsidian-nerv

An agentic knowledge nervous system: a multi-vault Obsidian v11 framework wired to a macOS CLI skill layer for structured knowledge management.

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

Open the vault folder in Obsidian (File → Open folder as vault), then complete the manual setup steps in **STORY-002**:

- Confirm Obsidian version ≥ 1.12.4
- Register the CLI binary
- Verify all settings rendered correctly
- Finalize workspace layouts and bookmark groups

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
