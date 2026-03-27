# CLI Guide

Reference for the Obsidian Nervous System CLI: Bash skill scripts and the TypeScript `nerv` binary.
For: knowledge engineers and developers operating Claude Code agents against local Obsidian vaults on macOS.

---

## Getting started

### Prerequisites

| Requirement      | Version / Detail                               |
| ---------------- | ---------------------------------------------- |
| macOS            | 12 Monterey or later (Bash 3.2+)               |
| Obsidian desktop | ≥ 1.12.4 (Bases feature required)              |
| Obsidian CLI     | registered as `obsidian` on `$PATH`            |
| Python 3         | system `/usr/bin/python3` (no packages needed) |
| Bun              | latest (only for `nerv` TypeScript CLI)        |

### Install and configure

```bash
# 1. Bootstrap a vault
./bootstrap-vault.sh study ~/vaults/study

# 2. Open the vault in Obsidian, then register the CLI:
#    Settings → General → Command line interface → toggle ON → Register CLI

# 3. Verify CLI access
obsidian version          # ≥ 1.12.4
obsidian files vault=study

# 4. PATH is set automatically by bootstrap-vault.sh in ~/.zprofile:
export PATH="${HOME}/.ontology-cli/core:${HOME}/.ontology-cli/agent:${PATH}"
```

### Build the TypeScript CLI (optional)

```bash
bun install
bun run build              # produces bin/nerv
nerv --version
```

### Run tests

```bash
bun run test:unit          # src/ unit tests — no live Obsidian needed
bun run test:integration   # requires .env.integration (OBSIDIAN_RUNNING=1)
```

---

## Known limitations

| ID  | Limitation                            | Workaround                                              |
| --- | ------------------------------------- | ------------------------------------------------------- |
| L1  | Obsidian must be running              | Launch Obsidian before invoking any skill               |
| L2  | Single vault per CLI session          | Open the target vault in Obsidian first                 |
| L3  | macOS only                            | No Linux/Windows support                                |
| L4  | No web vault support                  | Local vaults only; iCloud-synced vaults must be local   |
| L5  | One agent session per vault at a time | Multiple agents on the same vault cause race conditions |
| L7  | Bases requires Obsidian open          | `*.base` files render only inside the app               |
| L8  | Daily note must exist or be creatable | Create today's journal note before appending to it      |

---

## Skill overview

All Bash skills live under `~/.ontology-cli/` and accept a vault name as the first positional argument or via `vault=<name>`.
Every skill is idempotent — re-running produces no duplicate writes.

### Core skills (CRUD)

| Command             | Purpose                                                   | Output               |
| ------------------- | --------------------------------------------------------- | -------------------- |
| `create-project.sh` | Scaffold a project: ROOT + ontology + vocab + topk + base | text                 |
| `create-entity.sh`  | Create a typed note (LEAF/BRANCH/ROOT), wire parent       | JSON (with `--json`) |
| `add-connection.sh` | Add a typed connection with automatic inverse             | JSON                 |
| `import-json.sh`    | Bulk-create notes from a JSON array                       | JSON                 |

> [!tip]
> See [core-skills.md](core-skills.md) for full syntax, parameters, and examples.

### Maintenance and sync

| Command            | Purpose                                                   | Output               |
| ------------------ | --------------------------------------------------------- | -------------------- |
| `cli-lint.sh`      | Validate frontmatter, structure, limits                   | JSON (with `--json`) |
| `cli-orphans.sh`   | Detect orphaned/broken parent–child links                 | JSON (with `--json`) |
| `cli-relations.sh` | Enumerate connections, flag unknown relation types        | JSON (with `--json`) |
| `migrate.sh`       | Bulk schema changes from a declarative JSON spec          | text                 |
| `sync-topk.sh`     | Log overflow threshold violations                         | text                 |
| `sync-ontology.sh` | Sync ontology table with actual relations                 | text / JSON          |
| `sync-vocab.sh`    | Sync vocabulary table with note titles and aliases        | text                 |
| `weekly-review.sh` | Run all maintenance skills, summarise in daily note       | JSON (with `--json`) |
| `morning.sh`       | Daily startup: open daily note, inbox count, recent files | text                 |

> [!tip]
> See [maintenance-skills.md](maintenance-skills.md) for full syntax, parameters, and examples.

### Sensory skills (read-only retrieval)

| Command                | Purpose                                                         | Output |
| ---------------------- | --------------------------------------------------------------- | ------ |
| `context.sh`           | Relevance-scored vault search (weighted multi-factor)           | JSON   |
| `get-entity.sh`        | Deep single-note retrieval by name or alias                     | JSON   |
| `get-tree.sh`          | Hierarchical project tree as nested JSON                        | JSON   |
| `get-knowledge-gap.sh` | Structural deficiency report (stubs, orphans, gaps)             | JSON   |
| `explain-topic.sh`     | Teaching bundle: primary note + parent + siblings + connections | JSON   |

> [!tip]
> See [sensory-skills.md](sensory-skills.md) for full syntax, parameters, and examples.

### Dev skills (`~/.ontology-cli/dev/`)

| Command             | Purpose                                          | Output     |
| ------------------- | ------------------------------------------------ | ---------- |
| `dev-cycle.sh`      | Plugin feedback cycle: reload → errors → console | text       |
| `adr.sh`            | Create an Architecture Decision Record           | JSON       |
| `dependency-map.sh` | `depends-on` edge subgraph (JSON or DOT)         | JSON / DOT |
| `code-link.sh`      | Link a note to a source file path                | JSON       |

> [!tip]
> See [dev-skills.md](dev-skills.md) for full syntax, parameters, and examples.

### Study skills (`~/.ontology-cli/study/`)

| Command       | Purpose                                      | Output |
| ------------- | -------------------------------------------- | ------ |
| `quiz.sh`     | Generate practice questions from vault notes | JSON   |
| `coverage.sh` | Coverage report by domain                    | JSON   |
| `progress.sh` | Progress dashboard and weekly stats          | JSON   |

> [!tip]
> See [study-skills.md](study-skills.md) for full syntax, parameters, and examples.

### Obsidian CLI direct commands

Single-step operations that bypass `eval`. Prefer these over shell skills for one-shot reads, writes, and queries.

| Command                 | Purpose                       | Output      |
| ----------------------- | ----------------------------- | ----------- |
| `obsidian read`         | Read a note body              | text        |
| `obsidian create`       | Create a note                 | text        |
| `obsidian append`       | Append text to a note         | text        |
| `obsidian property:set` | Set one frontmatter field     | text        |
| `obsidian search`       | Full-text search              | text / JSON |
| `obsidian backlinks`    | Notes linking to a given note | text        |
| `obsidian tags`         | All tags with counts          | text        |
| `obsidian files`        | List vault files (sortable)   | text        |
| `obsidian unresolved`   | Unresolved wikilinks          | text        |
| `obsidian daily:read`   | Read today's daily note       | text        |
| `obsidian daily:append` | Append to today's daily note  | text        |
| `obsidian tasks`        | List open tasks               | text / JSON |

**Plugin dev commands** (dev vaults only):

| Command                   | Purpose                     |
| ------------------------- | --------------------------- |
| `obsidian plugin:reload`  | Hot-reload a plugin         |
| `obsidian dev:errors`     | Capture JS errors           |
| `obsidian dev:console`    | Stream console output       |
| `obsidian dev:screenshot` | Capture viewport screenshot |
| `obsidian dev:dom`        | Dump app DOM tree           |
| `obsidian dev:css`        | Inspect computed CSS        |
| `obsidian dev:mobile`     | Toggle mobile emulation     |

> Use direct commands for single-step operations.
> Use `obsidian eval` (via shell skills) when two or more steps must execute atomically.

---

## TypeScript CLI — `nerv`

The `nerv` binary is a production-grade TypeScript port of the Bash skill layer, compiled with Bun.

| Module                | Exports                                                                                                 | Purpose                         |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `src/cli.ts`          | CLI entry point, `Command` interface                                                                    | Subcommand dispatcher           |
| `src/lib/obsidian.ts` | `resolveVault`, `obEval`, `dailyAppend`, `rollbackLog`                                                  | Obsidian CLI wrappers           |
| `src/lib/shell.ts`    | `spawnCapture`                                                                                          | Async spawn with 30 s timeout   |
| `src/lib/logger.ts`   | `logError`, `logWarn`                                                                                   | Stderr logging                  |
| `src/lib/json.ts`     | `encodeForJs`, `parseJson`                                                                              | Safe JS embedding, JSON parsing |
| `src/types/`          | `NoteEntity`, `ProjectConfig`, `Connection`, `CommandResult`                                            | Shared type definitions         |
| `src/templates/`      | `renderLeaf`, `renderBranch`, `renderRoot`, `renderOntology`, `renderVocab`, `renderTopk`, `renderBase` | Typed note template renderers   |

> [!tip]
> See [nerv-cli.md](nerv-cli.md) for full module documentation and template parameter interfaces.

---

## Rollback recovery

When a skill fails after partial execution, `rollback_log` writes an entry to `_inbox/_rollback-log.md`.

**Recovery steps:**

1. Open `_inbox/_rollback-log.md` in Obsidian.
1. Identify the partially completed operation.
1. Delete the orphaned file or manually wire it into the parent's `children:` array.
1. Re-run the original skill command.

The Auditor subagent includes this file in its triage scope during weekly review.

---

## Related documents

| Document                | Location                         |
| ----------------------- | -------------------------------- |
| v11 framework reference | `docs/obsidian_documentation.md` |
| Agent routing patterns  | `cli/agent/patterns.md`          |
| Eval CRUD patterns      | `cli/core/PATTERNS.md`           |
| Skill registry          | `cli/agent/skills.md`            |
| Story plans             | `docs/plan/STORY-*.md`           |
