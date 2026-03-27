# obsidian-nerv

An agentic knowledge nervous system: a multi-vault Obsidian v11 framework wired to a macOS CLI skill layer for structured knowledge management.

## Status

All phases complete. The system is fully migrated to a compiled TypeScript binary (`bin/nerv`).

### Foundation and Bash Skill Layer ✅

- Vault bootstrap, CLI registration, core library, test harness
- Motor skills: `create-project`, `create-entity`, `add-connection`, `import-json`
- Reflex skills: `cli-lint`, `cli-orphans`, `cli-relations`
- Autonomic skills: `sync-topk`, `sync-ontology`, `sync-vocab`
- Orchestration: `weekly-review`, `morning`, schema migration
- Sensory skills: `context`, `get-entity`, `get-tree`, `get-knowledge-gap`, `explain-topic`
- Agent layer: skill registry, auditor subagent, study/dev vault skills, E2E tests

### CLI Skill Integration ✅

- Direct CLI commands documented in `PATTERNS.md`
- Command inventory registered in `skills.md`
- Native CLI diagnostics integrated into orchestration skills
- Plugin development cycle in `dev-projectA/CLAUDE.md`

### Production Grade: Bun Migration ✅

- All skills migrated to TypeScript under `src/commands/`
- Compiled to `bin/nerv` binary; Bash scripts removed
- Canvas commands: `canvas:tree`, `canvas:relations`, `canvas:dependencies`
- Web-ingest commands: `web-ingest:add`, `web-ingest:batch`, `web-ingest:monitor`

---

## Architecture

```
VAULT (persistent knowledge store)
  └── Obsidian v11 typed ontology — notes, connections, frontmatter

NERV CLI (unified Bun binary)
  ├── src/cli.ts        — entry point and subcommand dispatcher
  ├── src/commands/     — motor, reflex, sensory, orchestration, domain, canvas, web-ingest
  ├── src/types/        — EntityType, NoteEntity, ProjectConfig, Connection, CommandResult
  ├── src/lib/          — obsidian.ts, shell.ts, logger.ts, json.ts
  └── src/templates/    — typed render functions for all note templates

SKILL REGISTRY + AGENT LAYER
  ├── cli/agent/skills.md              — full command inventory with intent triggers
  ├── cli/agent/patterns.md            — subagent decision trees
  ├── docs/PATTERNS.md                 — eval primitives + direct CLI command reference
  └── cli/agent/dev-projectA/CLAUDE.md — dev vault agent config and plugin dev cycle

OBSIDIAN CLI (native IPC commands)
  ├── File I/O  — read, create, append, property:set
  ├── Search    — search, backlinks, tags, files, unresolved
  ├── Daily     — daily:read, daily:append, tasks
  └── Plugin Dev— plugin:reload, dev:errors, dev:console, dev:screenshot, dev:dom, dev:css, dev:mobile
```

---

## TypeScript / Bun CLI (`nerv`)

The compiled `nerv` binary is a self-contained executable that replaces ad-hoc `bun run` invocations.

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

### Command modules (`src/commands/`)

| Group         | Commands                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Motor         | `create-project`, `create-entity`, `add-connection`, `import-json`                                                            |
| Reflex        | `cli-lint` (exports `lintProject()`), `cli-orphans`, `cli-relations` (exports `getRelations()`)                               |
| Autonomic     | `sync-vocab`, `sync-topk`, `sync-ontology`                                                                                    |
| Sensory       | `context` (exports `scoreNote()`), `get-entity` (exports `resolveEntity()`), `get-tree`, `get-knowledge-gap`, `explain-topic` |
| Orchestration | `weekly-review`, `morning`, `migrate` (supports `--dry-run`)                                                                  |
| Dev           | `dev/adr`, `dev/dependency-map`, `dev/code-link`                                                                              |
| Study         | `study/quiz`, `study/coverage`, `study/progress`                                                                              |
| Canvas        | `canvas/tree`, `canvas/relations`, `canvas/dependencies` — JSON Canvas 1.0 output                                             |
| Web Ingest    | `web-ingest/add` (wraps `defuddle`), `web-ingest/batch`, `web-ingest/monitor` (RSS)                                           |

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

> **Security note**: Always call `encodeForJs()` before embedding user-supplied strings in `obEval()` expressions to prevent JS injection into the Obsidian runtime.

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
| Host CLI dirs       | `~/.ontology-cli/bin/`, `~/.ontology-cli/agent/`                                                                                                           |
| PATH                | `~/.ontology-cli/bin` appended to `~/.zprofile` (skipped if already present)                                                                               |
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

## Manual setup

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
