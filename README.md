# obsidian-nerv

An agentic knowledge nervous system: a multi-vault Obsidian v11 framework wired to a macOS CLI skill layer for structured knowledge management.

## Status

### Phase 1–5 — Foundation and Bash Skill Layer

| Story     | Title                                             | Status      |
| --------- | ------------------------------------------------- | ----------- |
| STORY-001 | Bootstrap vault environment                       | ✅ Complete |
| STORY-002 | Register CLI and verify manual setup              | ✅ Complete |
| STORY-003 | Implement core library (`lib.sh`)                 | ✅ Complete |
| STORY-004 | Build incremental test harness                    | ✅ Complete |
| STORY-005 | `create-project.sh` motor skill                   | ✅ Complete |
| STORY-006 | `create-entity.sh` motor skill                    | ✅ Complete |
| STORY-007 | `add-connection.sh` motor skill                   | ✅ Complete |
| STORY-008 | `import-json.sh` motor skill                      | ✅ Complete |
| STORY-009 | `cli-lint.sh` reflex skill                        | ✅ Complete |
| STORY-010 | `cli-orphans.sh` reflex skill                     | ✅ Complete |
| STORY-011 | `cli-relations.sh` reflex skill                   | ✅ Complete |
| STORY-012 | `migrate.sh` schema migration skill               | ✅ Complete |
| STORY-013 | `sync-topk.sh` autonomic skill                    | ✅ Complete |
| STORY-014 | `sync-ontology.sh`, `sync-vocab.sh`               | ✅ Complete |
| STORY-015 | `weekly-review.sh`, `morning.sh`                  | ✅ Complete |
| STORY-016 | `context.sh` primary sensory skill                | ✅ Complete |
| STORY-017 | `get-entity.sh` sensory skill                     | ✅ Complete |
| STORY-018 | `get-tree.sh` sensory skill                       | ✅ Complete |
| STORY-019 | `get-knowledge-gap.sh`, `explain-topic.sh`        | ✅ Complete |
| STORY-020 | Agent skill registry (`skills.md`)                | ✅ Complete |
| STORY-021 | Auditor subagent (`CLAUDE.md`)                    | ✅ Complete |
| STORY-022 | Study vault skills (quiz, coverage, progress)     | ✅ Complete |
| STORY-023 | Dev vault skills (adr, dependency-map, code-link) | ✅ Complete |
| STORY-024 | E2E test suite                                    | ✅ Complete |

### Phase 6 — EPIC-009: CLI Skill Integration

| Story     | Title                                                      | Status      |
| --------- | ---------------------------------------------------------- | ----------- |
| STORY-027 | Document direct CLI commands in `PATTERNS.md`              | ✅ Complete |
| STORY-028 | Register CLI command inventory in `skills.md`              | ✅ Complete |
| STORY-029 | Integrate native CLI diagnostics into orchestration skills | ✅ Complete |
| STORY-030 | Plugin development cycle in `dev-projectA/CLAUDE.md`       | ✅ Complete |

### Phase 7 — EPIC-010: Production Grade: Bun Migration

| Story     | Title                                                | Status      |
| --------- | ---------------------------------------------------- | ----------- |
| STORY-031 | Bun CLI foundation — `src/cli.ts`, types, core lib   | ✅ Complete |
| STORY-032 | Extract note templates as typed TypeScript functions | ✅ Complete |

---

## Architecture

```
VAULT (persistent knowledge store)
  └── Obsidian v11 typed ontology — notes, connections, frontmatter

CLI SKILL LAYER (bash nervous system I/O)
  ├── Motor skills    — create-project, create-entity, add-connection, import-json
  ├── Sensory skills  — context.sh, get-entity, get-tree, explain-topic
  ├── Reflex skills   — cli-lint, cli-orphans, cli-relations
  └── Autonomic skills— sync-vocab, sync-topk, sync-ontology, weekly-review

TYPESCRIPT LAYER (production Bun CLI — EPIC-010)
  ├── src/cli.ts      — nerv binary entry point and subcommand dispatcher
  ├── src/types/      — EntityType, NoteEntity, ProjectConfig, Connection, CommandResult
  ├── src/lib/        — obsidian.ts, shell.ts, logger.ts, json.ts (port of lib.sh)
  └── src/templates/  — typed render functions for all note templates

SKILL REGISTRY + AGENT LAYER
  ├── cli/agent/skills.md         — full command inventory with intent triggers
  ├── cli/agent/patterns.md       — subagent decision trees
  ├── cli/core/PATTERNS.md        — eval primitives + direct CLI command reference
  └── cli/agent/dev-projectA/CLAUDE.md — dev vault agent config and plugin dev cycle

DIRECT CLI COMMANDS (EPIC-009)
  ├── File I/O  — read, create, append, property:set
  ├── Search    — search, backlinks, tags, files, unresolved
  ├── Daily     — daily:read, daily:append, tasks
  └── Plugin Dev— plugin:reload, dev:errors, dev:console, dev:screenshot, dev:dom, dev:css, dev:mobile
```

---

## TypeScript / Bun CLI (`nerv`)

Phase 7 (EPIC-010) establishes a production-grade TypeScript layer that mirrors the Bash skill layer. The compiled `nerv` binary replaces ad-hoc `bun run` invocations with a single self-contained executable.

### Build

```bash
bun install
bun run build          # produces bin/nerv
nerv --version         # prints package.json version
```

### Test

```bash
bun test               # all tests
bun run test:unit      # src/ unit tests only (no Obsidian required)
bun run test:integration  # requires .env.integration with OBSIDIAN_RUNNING=1
```

### TypeScript modules

| Path                      | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `src/cli.ts`              | Entry point; routes `process.argv[2]` to `src/commands/<name>.ts` |
| `src/types/entity.ts`     | `EntityType`, `EntityStatus`, `NoteEntity` interface              |
| `src/types/project.ts`    | `ProjectConfig`, `VaultRef`                                       |
| `src/types/connection.ts` | `Connection`, `ConnectionLine`                                    |
| `src/types/result.ts`     | Generic `CommandResult<T>`, `ExitCode`                            |
| `src/lib/obsidian.ts`     | `resolveVault()`, `obEval()`, `dailyAppend()`, `rollbackLog()`    |
| `src/lib/shell.ts`        | `spawnCapture()` with 30-second timeout and `ShellTimeoutError`   |
| `src/lib/logger.ts`       | `logError()` (exits 1), `logWarn()`                               |
| `src/lib/json.ts`         | `encodeForJs()`, `parseJson<T>()`                                 |

### Note templates (`src/templates/`)

Typed TypeScript render functions extracted from the Bash heredoc templates. All functions accept a typed parameter interface and return a complete Markdown string ready for `app.vault.create`.

| Export                           | Template type              |
| -------------------------------- | -------------------------- |
| `renderLeaf(LeafParams)`         | `type: LEAF` note          |
| `renderBranch(BranchParams)`     | `type: BRANCH` note        |
| `renderRoot(RootParams)`         | `type: ROOT` note          |
| `renderOntology(OntologyParams)` | Relationship type registry |
| `renderVocab(VocabParams)`       | Vocabulary tracking table  |
| `renderTopk(TopkParams)`         | Overflow log scaffold      |
| `renderBase(BaseParams)`         | Bases YAML filter view     |

> All render functions are re-exported from `src/templates/index.ts`.

> **Security note**: `obEval()` accepts pre-built JS expressions only. Always use
> `encodeForJs()` from `src/lib/json.ts` when embedding any user-supplied string
> to prevent JS injection into the Obsidian runtime.

---

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
