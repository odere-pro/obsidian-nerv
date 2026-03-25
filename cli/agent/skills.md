# Skill Registry — Obsidian Nervous System

Shared reference for all agents. Deploy to `~/.ontology-cli/agent/skills.md`.
Each entry lists: name, CLI command, input parameters, output format, and the intent trigger that activates it.

Rules for invocation:

- Always resolve vault name before invoking any skill (positional first arg or `vault=<name>`).
- Skills emit structured JSON unless marked **text**. Parse JSON; do not screen-scrape.
- On non-zero exit: capture stderr, report verbatim to user. Retry once, then escalate.

---

## Context Retrieval

Skills that read from the vault without writing. Run these before any write skill.

| Name              | Command                | Inputs                                 | Output                                                                | Intent trigger                                                                                 |
| ----------------- | ---------------------- | -------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Context search    | `context.sh`           | `<vault> "<query>" [<limit>]`          | JSON: `{query, vault, results[]}`                                     | User asks a knowledge question: "what is X", "how does Y", "explain Z", "what do I know about" |
| Entity detail     | `get-entity.sh`        | `<vault> "<search-term>"`              | JSON: `{path, matchType, frontmatter, sections, backlinks, outgoing}` | User asks about a specific note: "tell me about X note", "show me X", "get X"                  |
| Tree view         | `get-tree.sh`          | `<vault> <project_slug> [--depth <N>]` | JSON: `{folder, nodeCount, tree[]}`                                   | User asks for project structure, hierarchy, or tree overview                                   |
| Knowledge gap     | `get-knowledge-gap.sh` | `<vault> <project_slug> "<topic>"`     | JSON: `{topic, gaps[], coverage}`                                     | User asks what gaps exist, what is missing, what hasn't been covered                           |
| Topic explanation | `explain-topic.sh`     | `<vault> "<topic>" [<depth>]`          | JSON: `{topic, explanation, sources[]}`                               | User asks for a synthesis or explanation of a multi-note topic                                 |

---

## CRUD

Skills that create or modify vault content. Always run a Context Retrieval skill first to confirm the target exists (or confirm it does not before creating).

| Name           | Command             | Inputs                                                                              | Output                                  | Intent trigger                                             |
| -------------- | ------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Create project | `create-project.sh` | `<vault> <slug> "<Title>"`                                                          | text: confirmation + paths              | User asks to start a new project, domain, or topic area    |
| Create entity  | `create-entity.sh`  | `<vault> <project> <TYPE> <slug> "<Title>" <parent_slug> <kind> [<spine>] [--json]` | JSON (--json): `{created, path, title}` | User asks to save, create, capture, or add a note          |
| Add connection | `add-connection.sh` | `<vault> <source_path> <rel_type> <target_path> [--bidirectional]`                  | JSON: `{written, source, target, rel}`  | User asks to link, connect, wire, or relate two notes      |
| Import JSON    | `import-json.sh`    | `<vault> <project> <json_file>`                                                     | JSON: `{imported, skipped, errors[]}`   | User asks to bulk-import structured data or a JSON dataset |

---

## Maintenance

Skills that audit, lint, and keep the vault consistent. Run these on a schedule or before a review session.

| Name          | Command            | Inputs                        | Output                                  | Intent trigger                                                                     |
| ------------- | ------------------ | ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Lint vault    | `cli-lint.sh`      | `<vault> [<folder>] [--json]` | JSON (--json): `{violations[]}`         | User asks for a health check, lint, or audit of the vault                          |
| Relations map | `cli-relations.sh` | `<vault> [<folder>] [--json]` | JSON (--json): `{relations[], summary}` | User asks to see all connections, relationship types, or connection counts         |
| Sync top-K    | `sync-topk.sh`     | `<vault> <project_slug>`      | text: overflow log rows appended        | Autonomic — run after bulk create/import, or when connection count warnings appear |

---

## Study

Skills specific to the `study` vault. Source from `~/.ontology-cli/study/`.

| Name               | Command            | Inputs                                   | Output                                                      | Intent trigger                                                           |
| ------------------ | ------------------ | ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Coverage report    | `coverage.sh`      | `<vault> <project_slug>`                 | JSON: `{project, domains[], overall}`                       | User asks about coverage, progress by domain, or certification readiness |
| Quiz prep          | `quiz.sh`          | `<vault> <project_slug> <spine> <count>` | JSON: `{instruction, spine, notes[]}`                       | User asks to be quizzed, tested, or wants practice questions             |
| Progress dashboard | `progress.sh`      | `<vault> <project_slug>`                 | JSON: `{project, notes, completion, knowledge, thisWeek[]}` | User asks for a progress report, dashboard, or weekly stats              |
| Weekly review      | `weekly-review.sh` | `<vault> [<project_slug>] --json`        | JSON: `{findings[], summary}`                               | User asks for a review, audit summary, or weekly wrap-up                 |

---

## Dev

Skills specific to the `dev-projectA` vault. Source from `~/.ontology-cli/dev/`.

| Name                  | Command             | Inputs                                                | Output                         | Intent trigger                                                                    |
| --------------------- | ------------------- | ----------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| Architecture decision | `adr.sh`            | `<vault> <project> <slug> "<Title>" "<decision>"`     | JSON: `{created, path, title}` | User proposes, records, or asks about an architecture decision                    |
| Dependency map        | `dependency-map.sh` | `<vault> <project_slug> [--json]`                     | JSON: `{nodes[], edges[]}`     | User asks about system dependencies, component relationships, or dependency graph |
| Code link             | `code-link.sh`      | `<vault> <note_path> <repo_url> <file_path> [<line>]` | JSON: `{linked, note, target}` | User asks to link a note to a source file, function, or code location             |
