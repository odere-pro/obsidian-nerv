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

---

## Obsidian CLI — Direct Commands

### When to Use

Prefer direct commands for single-step operations. Use shell skills (which call `obsidian eval`) for multi-step atomic operations.

Shell skills handle complex logic that requires two or more steps to execute atomically (e.g. read frontmatter _then_ write it back, or append a connection _then_ append the inverse). Direct commands are one-liners for reads, simple writes, and queries — they have no rollback on partial failure.

### Summary

| Command               | Purpose                                           | Output              |
| --------------------- | ------------------------------------------------- | ------------------- |
| `obsidian read`       | Read a note's full Markdown body                  | text                |
| `obsidian create`     | Create a note with optional initial content       | text                |
| `obsidian append`     | Append text to the end of a note                  | text                |
| `obsidian property:set` | Set a single frontmatter property               | text                |
| `obsidian search`     | Full-text search across the vault                 | text / JSON / clipboard |
| `obsidian backlinks`  | List all notes linking to a given note            | text                |
| `obsidian tags`       | List all tags with occurrence counts              | text                |
| `obsidian files`      | List vault files sorted and limited               | text / clipboard    |
| `obsidian unresolved` | List all unresolved wikilinks                     | text                |
| `obsidian daily:read` | Read today's daily note                           | text                |
| `obsidian daily:append` | Append text to today's daily note               | text                |
| `obsidian tasks`      | List open tasks across the vault                  | text / JSON         |
| `obsidian plugin:reload` | Hot-reload a plugin after code changes         | text                |
| `obsidian dev:errors` | Capture console errors from Obsidian              | text                |
| `obsidian dev:console` | Stream developer console output                  | text                |
| `obsidian dev:screenshot` | Capture a screenshot of the Obsidian window  | clipboard           |
| `obsidian dev:dom`    | Dump the Obsidian application DOM                 | text                |
| `obsidian dev:css`    | Inspect CSS variables in the current theme        | text                |
| `obsidian dev:mobile` | Toggle mobile layout emulation                    | text                |

---

### File I/O

| Name             | Syntax                                                                | Output | Intent trigger                                                                                               |
| ---------------- | --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Read note        | `obsidian read vault=<name> file="<note>"`                            | text   | When the user asks to read, view, or show the full content of a specific named note                          |
| Create note      | `obsidian create vault=<name> name="<note>" [content="<body>"]`       | text   | When the user asks to create a single note and no parent `children` array update is required                 |
| Append to note   | `obsidian append vault=<name> file="<note>" content="<text>"`         | text   | When the user asks to add text to the end of a specific note (not to a named section like `## Connections`)  |
| Set property     | `obsidian property:set vault=<name> file="<note>" key=<prop> value=<val>` | text | When the user asks to update exactly one frontmatter field on a specific note and the value is not a YAML array |

---

### Search & Query

| Name             | Syntax                                                                 | Output                          | Intent trigger                                                                                              |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Full-text search | `obsidian search vault=<name> query="<term>" [--json] [--copy]`        | text; JSON with `--json`; clipboard with `--copy` | When the user asks to find notes containing a specific keyword or phrase (prefer `context.sh` for ranked results) |
| Backlinks        | `obsidian backlinks vault=<name> file="<note>"`                        | text                            | When the user asks which specific notes link to a particular named note                                     |
| All tags         | `obsidian tags vault=<name>`                                           | text                            | When the user asks for a complete list of all tags in the vault with their occurrence counts                 |
| List files       | `obsidian files vault=<name> [sort=modified\|created\|name] [limit=<n>] [--copy]` | text; clipboard with `--copy` | When the user asks to list recently modified files or browse vault files sorted by a specific field         |
| Unresolved links | `obsidian unresolved vault=<name>`                                     | text                            | When the user asks for broken links, missing notes, or unresolved wikilinks across the vault                |

---

### Daily Note

| Name              | Syntax                                                     | Output          | Intent trigger                                                                                   |
| ----------------- | ---------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| Read daily note   | `obsidian daily:read vault=<name>`                         | text            | When the user asks to read, view, or show today's journal or daily note body                     |
| Append to daily   | `obsidian daily:append vault=<name> content="<text>"`      | text            | When the user asks to log an entry or add a bullet to today's daily note (not to a named section) |
| List open tasks   | `obsidian tasks vault=<name> [--json]`                     | text; JSON with `--json` | When the user asks to show all open to-do items or unchecked checkboxes across the vault |

---

### Plugin Dev

| Name              | Syntax                                                          | Output    | Intent trigger                                                                                            |
| ----------------- | --------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| Reload plugin     | `obsidian plugin:reload vault=<name> plugin=<plugin-id>`        | text      | When the user asks to hot-reload a specific plugin after making code changes                              |
| Capture errors    | `obsidian dev:errors vault=<name>`                              | text      | When the user asks to see or capture console errors thrown by the Obsidian app or a plugin                |
| Stream console    | `obsidian dev:console vault=<name>`                             | text      | When the user asks to monitor or stream live developer console output from the Obsidian process           |
| Screenshot        | `obsidian dev:screenshot vault=<name>`                          | clipboard | When the user asks to take or capture a screenshot of the current Obsidian window                         |
| Inspect DOM       | `obsidian dev:dom vault=<name>`                                 | text      | When the user asks to inspect or dump the HTML DOM of the running Obsidian application                    |
| Inspect CSS       | `obsidian dev:css vault=<name>`                                 | text      | When the user asks to inspect CSS variables or computed styles in the current Obsidian theme               |
| Mobile emulation  | `obsidian dev:mobile vault=<name>`                              | text      | When the user asks to toggle or test the mobile layout view inside the Obsidian desktop application       |
