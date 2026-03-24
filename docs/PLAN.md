# PLAN.md

Build an agentic knowledge nervous system: a multi-vault Obsidian v11 framework wired to a macOS CLI skill layer that Claude Code agents invoke to create, retrieve, maintain, and reason over structured knowledge programmatically.
For: knowledge engineers and developers deploying Claude Code agents against local Obsidian vaults on macOS.

## Architecture

```
VAULT (persistent knowledge store)
  └── Obsidian v11 typed ontology — notes, connections, frontmatter
CLI SKILL LAYER (nervous system I/O)
  ├── Motor skills   — create-project, create-entity, add-connection, import-json
  ├── Sensory skills — context.sh, get-entity, get-tree, explain-topic
  ├── Reflex skills  — cli-lint, cli-orphans, cli-relations
  └── Autonomic skills — sync-vocab, sync-topk, sync-ontology, weekly-review
SKILL REGISTRY (skill index — what agents know they can invoke)
AGENT LAYER (routing brain)
  ├── Researcher subagent — vault-first retrieval → teach → save offer
  ├── Writer subagent    — determine type → create-entity → log
  ├── Linker subagent    — add-connection + auto-inverse → enforce limits
  └── Auditor subagent   — weekly-review → triage → remediate via CLI
CLAUDE.md (per-vault agent nervous system config)
```

## Stories

### Story 001 — Bootstrap vault environment

**Description**
Author `bootstrap-vault.sh` as a single idempotent script that provisions the entire framework substrate for a named vault: creates the vault directory, writes all `.obsidian/*.json` configuration files, scaffolds the vault folder hierarchy, creates all note and base templates, initializes Git backup, creates the host-level `~/.ontology-cli/` script directory tree, and appends PATH exports to `~/.zprofile`. This replaces approximately nine manual setup stories with one automated, repeatable, testable entry point.

**Acceptance criteria**
1. `bootstrap-vault.sh study ~/vaults/study` creates the vault directory, all `.obsidian/` config files, all vault folders, all templates, all base files, the host script directory, and the Git repository in one invocation.
2. `.obsidian/app.json` contains: default new note location `_inbox`, link format shortest-path, wikilinks enabled, auto-update internal links enabled, detect all extensions enabled, attachment subfolder `_attachments`, deleted files to system trash, excluded files `_templates/*` and `_scripts/*`, properties visible, strict line breaks off.
3. `.obsidian/core-plugins.json` enables all 18 required plugins: Templates, Backlinks, Outgoing Links, Graph View, Search, Page Preview, Tags View, Quick Switcher, Command Palette, Bookmarks, Properties View, Note Composer, Outline, Bases, File Recovery, Word Count, Daily Notes, Workspaces.
4. `.obsidian/templates.json` sets folder `_templates/` and date format `YYYY-MM-DD`; `.obsidian/daily-notes.json` sets date format `YYYY-MM-DD`, folder `journals/daily/`, template `_templates/tpl-daily.md`.
5. `.obsidian/hotkeys.json` binds all 9 custom hotkeys: Alt+T, Cmd+O, Cmd+Shift+F, Cmd+G, Alt+B, Cmd+;, Alt+C, Alt+D, Alt+W.
6. `.obsidian/graph.json` configures arrows enabled, tags enabled, attachments enabled, color group `path:_inbox/` as red, and two placeholder spine tag color groups.
7. Vault folders created: `_inbox/`, `_templates/`, `_scripts/`, `_scripts/cli/`, `_bases/`, `journals/daily/`, `projects/`.
8. All 10 template files written to `_templates/`: `tpl-root.md`, `tpl-branch.md`, `tpl-leaf.md`, `tpl-inbox.md`, `tpl-daily.md`, `tpl-ontology.md`, `tpl-vocab.md`, `tpl-topk.md`, `tpl-project.base`.
9. All 3 vault-wide audit bases written to `_bases/`: `audit-missing-properties.base`, `audit-drafts.base`, `audit-orphans.base`.
10. Host directories created: `~/.ontology-cli/core/`, `~/.ontology-cli/agent/`, `~/.ontology-cli/study/`, `~/.ontology-cli/dev/`; PATH export appended to `~/.zprofile` (idempotent — skips if already present).
11. Git initialized at vault root with `.gitignore` containing `.obsidian/workspace.json` and `.obsidian/workspaces.json`; initial commit includes `.obsidian/` and all created files.
12. Re-running on an existing vault exits 0 with no file modifications (idempotent).
13. `bootstrap-vault.sh dev-projectA ~/vaults/dev-projectA` produces an identical structure for a second vault.

**Context**
Template content must match v11 §14 exactly. `tpl-root.md`: `type: ROOT`, all v11 §8 frontmatter fields (`title`, `aliases`, `type`, `kind`, `parent`, `children`, `spine`, `status`, `attachments`, `created`, `modified`), body sections `## Summary`, `## Map`, `## Connections`, `## Flags`, collapsed callout stub for project base embed. `tpl-branch.md` and `tpl-leaf.md`: full v11 §8 frontmatter, sections `## Breadcrumb`, `## Summary`, `## Content`, `## Connections`, `## Flags`. `tpl-inbox.md`: `captured: {{date}}`, `source: ""`, `target: ""`, `> [!todo] Triage` callout, `## Raw`, `## Placement Notes`. `tpl-daily.md`: `type: daily-note`, `date: {{date}}`, `tags: [journal/daily]`, sections `## Ontology Work Log` (subsections `### Entities Created`, `### Schema Changes`, `### Decisions`, `### Open Questions`), `## Triage` with embedded query block, `## Tasks`, `## Notes`. `tpl-ontology.md`: `type: ONTOLOGY`, 10 default relationship types table (`triggers`, `depends-on`, `implements`, `extends`, `compares-to`, `replaces`, `feeds-data`, `authenticates-via`, `contains`, `mitigates`), pipe-delimited with backtick-wrapped type names for `awk` parsing. `tpl-vocab.md`: `type: VOCAB`, heading levels L0–L3, `## Shared Terms`, `## Orphan Terms`. `tpl-topk.md`: `type: TOPK`, limits table, `## Overflow Log`, `## Split History`. `tpl-project.base`: three views (All Notes, Drafts, Browse), formulas for `status_icon` (single-quoted), `last_updated`, `link_count`, `PROJECT_SLUG_PLACEHOLDER` for `sed` replacement. Audit bases per v11 §6.3. Hotkey IDs are Obsidian internal command IDs — reference `hotkeys.json` format from an existing Obsidian vault to derive the correct command strings. Workspaces and bookmarks require Obsidian to be open with panels arranged — write placeholder files that the operator finalizes in Story 002.

---

### Story 002 — Register CLI and verify manual setup

**Description**
Open both vaults in Obsidian, register the CLI binary, verify all `.obsidian/*.json` settings rendered correctly, finalize workspace layouts and bookmark groups that require live panel arrangement, and confirm that the Bases plugin renders all audit and template base files without errors. This is the only manual story in the plan — it covers the small set of actions that require the Obsidian GUI to be running.

**Acceptance criteria**
1. Obsidian version ≥ 1.12.4 confirmed at Settings → About in both vaults.
2. CLI registered: `obsidian version` returns ≥ 1.12.4 from a new terminal session; `obsidian vault`, `obsidian files`, and `obsidian eval "1+1"` succeed in both vaults.
3. `obsidian files vault="study"` and `obsidian files vault="dev-projectA"` both return file counts without error.
4. All settings from Story 001 verified visually in Settings → Files & Links, Settings → Editor, Settings → Templates, Settings → Daily Notes.
5. All 18 core plugins confirmed enabled at Settings → Core plugins; Bases plugin (≥ 1.9) present in list.
6. File Recovery snapshot interval is 5 minutes; history length is 30 days (Settings → File Recovery).
7. "Show backlinks in document" activated via Command Palette → "Toggle backlinks in document".
8. Three workspaces saved via Command Palette → Manage workspaces: `ontology-work` (File Explorer + Tags + Bookmarks left, active note center, Local Graph depth 2 + Backlinks + Outgoing Links + Outline right), `ontology-review` (Search + Bookmarks left, schema + audit base split center, All Properties right), `ontology-explore` (Search left, Global Graph center, Outline right).
9. Three bookmark groups created: Ontology/ (ROOT notes + `_ontology` files), Audit Queries/ (7 saved search queries per v11 §2.7), Active Work/ (initially empty).
10. All 3 audit bases in `_bases/` and `tpl-project.base` in `_templates/` render valid table views in Obsidian with no YAML parse errors.
11. Alt+W opens workspace switcher; all three workspace names appear.

**Context**
Depends on Story 001. CLI registration: Settings → General → Command line interface → toggle ON → Register CLI. For zsh, Obsidian writes to `~/.zprofile` automatically. Obsidian must be running for all `obsidian eval` calls throughout the framework (limitation L1). Bookmark saved-search queries require running each search first, then clicking the bookmark icon in the Search panel header. Build each workspace layout before saving. Apply verification identically across both vaults. Any `.obsidian/` config discrepancies found during verification must be corrected in `bootstrap-vault.sh` (Story 001) and the script re-run — do not fix settings manually.

---

### Story 003 — Implement core library

**Description**
Author `~/.ontology-cli/core/lib.sh` containing shared functions that every CLI skill sources: vault resolution, `obsidian eval` wrapper, daily-note append, error handler, JSON output helper, and a partial-failure rollback logger. This library is the nervous system's spinal cord — it enforces consistent vault targeting, idempotent patterns, JSON-compatible error reporting, and a standard recovery mechanism when multi-step operations fail partway through.

**Acceptance criteria**
1. `lib.sh` exports: `ob_eval(vault, expr)` wrapping `obsidian eval vault="$vault" "$expr"` with proper quoting; `resolve_vault(arg)` returning vault name from `vault=` parameter or defaulting to active vault; `daily_append(vault, content)` wrapping `obsidian daily:append`; `log_error(msg)` writing to stderr and exiting 1; `emit_json(data)` writing JSON to stdout; `rollback_log(vault, operation, partial_state)` appending a structured entry to `_inbox/_rollback-log.md` with timestamp, operation name, and partial state description.
2. `source ~/.ontology-cli/core/lib.sh && ob_eval study "app.vault.getName()"` returns `"study"`.
3. `resolve_vault "vault=dev-projectA"` returns `dev-projectA`; `resolve_vault ""` returns the active vault name.
4. `rollback_log study "create-entity" "Note created at path X but parent children array not updated"` creates or appends to `_inbox/_rollback-log.md` in the study vault.
5. All functions are tested with a disposable note and cleaned up; all tests exit 0.
6. `lib.sh` contains a version variable `LIB_VERSION="1.0.0"` printed by `lib.sh --version`.

**Context**
Depends on Story 002 (CLI registered). The `ob_eval` wrapper must quote the `expr` argument to prevent shell word-splitting on multi-token JavaScript expressions. The `rollback_log` function writes to `_inbox/` because rollback entries are untriaged items requiring operator attention — the Auditor subagent (Story 021) includes `_rollback-log.md` in its triage scope. Obsidian must be running for any `ob_eval` call (limitation L1).

---

### Story 004 — Build incremental test harness

**Description**
Author `~/.ontology-cli/core/test-harness.sh` as a lightweight test runner that creates a disposable `_test-project` in a target vault, executes a named test script or all `test-*.sh` files in a given directory, validates results, cleans up, and reports pass/fail per test. Author `test-lib.sh` with the first test: a round-trip CRUD cycle using `lib.sh` functions directly. Every subsequent skill story adds its own `test-*.sh` file that plugs into this harness, providing incremental regression coverage from the start.

**Acceptance criteria**
1. `test-harness.sh study` creates `projects/_test-project/` with a ROOT note via `ob_eval`, runs all `test-*.sh` files found in `~/.ontology-cli/core/tests/`, cleans up the project, and reports `N passed, M failed` with exit 0 when all pass.
2. `test-harness.sh study test-lib.sh` runs only the named test file.
3. Cleanup uses `obsidian eval` to trash the test project folder: `app.vault.trash(folder, false)` — never `rm`.
4. `test-lib.sh` verifies: `ob_eval` returns expected output, `resolve_vault` resolves both named and default vaults, `daily_append` writes to the current daily note, `rollback_log` creates the log entry, and all cleanup succeeds.
5. `test-harness.sh` exits 1 with failing test names on stderr when any test fails; total runtime < 15 seconds for a single test.
6. A `tests/` directory exists at `~/.ontology-cli/core/tests/` containing `test-lib.sh`.

**Context**
Depends on Story 003 (lib.sh). The harness creates the test project at the start of each run and tears it down at the end — tests must not depend on state from prior test files. Each skill story from Story 005 onward includes a `test-<skill>.sh` acceptance criterion that registers with this harness. JSON output validation uses `python3 -m json.tool` (macOS built-in, zero installs per requirement NF2).

---

### Story 005 — Implement create-project.sh skill

**Description**
Author `create-project.sh` in `~/.ontology-cli/core/` to scaffold a complete project — ROOT note, `_ontology`, `_vocab`, `_topk`, and `.base` file — in one command. This is the foundation motor skill; every other CRUD skill targets entities within projects that this script creates. The script sources `lib.sh` and uses the `rollback_log` function if any step fails after partial creation.

**Acceptance criteria**
1. `create-project.sh study aws "Amazon Web Services"` produces exactly 5 files in `projects/aws/`: `AWS.ROOT - Amazon Web Services.md`, `_ontology.aws.md`, `_vocab.aws.md`, `_topk.aws.md`, `aws.base`.
2. ROOT note frontmatter: `type: ROOT`, `kind: concept`, `spine: aws`, `status: draft`, `created` and `modified` set to today in `YYYY-MM-DD`.
3. `_ontology.aws.md` contains the full 10-row default relationship types table from `tpl-ontology.md`.
4. `aws.base` contains `file.inFolder("projects/aws")` — the placeholder replaced via `sed`.
5. Re-running on an existing project exits 0 with no file modifications (idempotent).
6. `vault=` parameter routes to the correct vault: `create-project.sh vault=dev-projectA svc "My Service"` creates in the dev vault.
7. File creation verified via `app.vault.getAbstractFileByPath` — not `ls` (requirement R8: all writes through Obsidian runtime).
8. If the ROOT note is created but a subsequent file fails, `rollback_log` records the partial state before exiting 1.
9. `tests/test-create-project.sh` passes in the test harness.

**Context**
Depends on Story 001 (templates exist in vault), Story 003 (lib.sh), Story 004 (test harness). Sources `lib.sh`. Copies template files with `cp`, then replaces placeholders with `sed -i ''`. Naming convention: `[PROJECT_UPPERCASE].[slug] - [Title].md` where PROJECT is the slug uppercased via `tr '[:lower:]' '[:upper:]'`. Idempotency check: `app.vault.getAbstractFileByPath(path)` — if non-null, skip and exit 0.

---

### Story 006 — Implement create-entity.sh skill

**Description**
Author `create-entity.sh` in `~/.ontology-cli/core/` to create a single typed note from the correct template, populate all frontmatter fields, wire it into the parent's `children:` array, and log creation to the daily note. This is the primary motor skill for knowledge capture — the Writer subagent invokes it exclusively for all note creation. If the note is created but the parent update fails, `rollback_log` records the orphaned note for triage.

**Acceptance criteria**
1. `create-entity.sh study testproj LEAF test-leaf "Test Leaf" ROOT concept testproj` creates `projects/testproj/TESTPROJ.test-leaf - Test Leaf.md` with `type: LEAF`, `kind: concept`, `spine: testproj`, `status: draft`, `parent: "[[TESTPROJ.ROOT - ...]]"`.
2. The parent note's `children:` array is updated to include `"[[TESTPROJ.test-leaf - Test Leaf]]"` using `app.fileManager.processFrontMatter`.
3. Spine is inherited from the parent note's `spine` field when not explicitly passed.
4. `daily_append()` from lib.sh writes `- Created [[TESTPROJ.test-leaf - Test Leaf]]` to the current daily note.
5. Exits 1 with a stderr message if the parent note is not found.
6. Exits 0 without modification if a note with the same path already exists (idempotent).
7. Emits JSON when `--json` flag passed: `{"created":true,"path":"...","title":"..."}`.
8. If note creation succeeds but parent `children:` update fails, `rollback_log` records the partial state and exits 1.
9. `tests/test-create-entity.sh` passes in the test harness.

**Context**
Depends on Story 005 (project must exist), Story 003 (lib.sh). Sources `lib.sh`. Template selection: LEAF → `tpl-leaf.md`, BRANCH → `tpl-branch.md`, ROOT → `tpl-root.md`. Uses `app.fileManager.processFrontMatter` for all property writes — this is the only approved write path (requirement R8). The `--json` flag is required by sensory skills that parse output programmatically.

---

### Story 007 — Implement add-connection.sh skill

**Description**
Author `add-connection.sh` in `~/.ontology-cli/core/` to write a typed connection to a source note's `## Connections` section and auto-derive and write the declared inverse to the target note by parsing the project's `_ontology.[project].md` relationship types table. This skill enforces bidirectional integrity at write time. If the forward write succeeds but the inverse write fails, `rollback_log` records the one-sided connection.

**Acceptance criteria**
1. `add-connection.sh study "projects/testproj/TESTPROJ.note-a - Note A.md" "depends-on" "projects/testproj/TESTPROJ.note-b - Note B.md" "test context"` writes `- depends-on :: [[TESTPROJ.note-b - Note B|Note B]] — test context` to Note A's `## Connections` section.
2. The declared inverse (`depended-by` per default ontology) is written to Note B's `## Connections` section: `- depended-by :: [[TESTPROJ.note-a - Note A|Note A]] — inverse of: test context`.
3. Relationship type is validated against `_ontology.[project].md`; an unknown type emits a stderr warning but exits 0.
4. Re-running the same command on an already-connected pair exits 0 with no duplicate line written (idempotent).
5. Alias in the wikilink is derived from the note title by stripping the `PREFIX.slug - ` prefix.
6. If the target note's `## Connections` already contains 7 entries, the script emits `"Connection limit (7) reached on <note>"` to stderr and exits 1.
7. Symmetric relationships (e.g., `compares-to`) write the same relationship type as the inverse.
8. If the forward connection is written but the inverse fails, `rollback_log` records the one-sided connection before exiting 1.
9. `tests/test-add-connection.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 005 (project with `_ontology` file). Sources `lib.sh`. Parse `_ontology.[project].md`'s `## Relationship Types` table with `awk` — extract the forward type and its Inverse column. Write to `## Connections` using `app.vault.process` for atomic read-modify-write. `app.vault.process` ensures no race conditions (limitation L5 — one agent session per vault at a time).

---

### Story 008 — Implement import-json.sh and document CRUD patterns

**Description**
Author `import-json.sh` in `~/.ontology-cli/core/` for bulk note creation from a JSON array, and document the canonical `obsidian eval` patterns for reading frontmatter as JSON, updating single properties, appending to named sections, moving notes with link-update, and deleting to trash in `~/.ontology-cli/core/PATTERNS.md`. These patterns are the low-level primitives that all higher-level skills compose.

**Acceptance criteria**
1. `import-json.sh study testproj /tmp/notes.json tpl-leaf` where `notes.json` is `[{"name":"TestImport","kind":"concept","spine":"test","type":"LEAF"}]` creates `TESTPROJ.testimport - TestImport.md` with correct frontmatter.
2. Extra JSON properties beyond the standard schema are passed through to frontmatter via `processFrontMatter`.
3. Skips existing notes without error; reports `Created: N, Skipped: M` on completion (idempotent).
4. `PATTERNS.md` documents and provides verified test invocations for all 5 patterns: read frontmatter as JSON (`app.metadataCache.getFileCache(f)?.frontmatter`), update single property (`app.fileManager.processFrontMatter`), append to named section (`app.vault.process` with heading regex), move note (`app.fileManager.renameFile`), delete to trash (`app.vault.trash(f, false)`).
5. `import-json.sh` uses `python3 -c "import json,sys; ..."` for JSON parsing — zero `npm`/`pip` installs (requirement NF2).
6. The move pattern documents that `app.fileManager.renameFile` updates all internal wikilinks automatically — critical for LEAF → BRANCH promotion per v11 §21.
7. `tests/test-import-json.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 005 (project must exist). Sources `lib.sh`. `PATTERNS.md` serves as the internal reference for all skill authors (Stories 009–020) and the agent layer (Story 021).

---

### Story 009 — Implement cli-lint.sh reflex skill

**Description**
Author `cli-lint.sh` in `~/.ontology-cli/core/` using `obsidian eval` and `app.metadataCache` to validate frontmatter completeness, type-specific structural rules, callout flag limits, connection typing, breadcrumb presence, and legacy tag usage. This is the primary reflex skill — it fires after every `create-entity.sh` call in automated workflows and is the first check in `weekly-review.sh` (Story 015).

**Acceptance criteria**
1. Detects and reports all violations: missing required fields (`title`, `type`, `kind`, `spine`, `status`, `created`, `aliases`); ROOT with non-empty `parent`; BRANCH or LEAF without `parent`; BRANCH with empty `children`; spine tag in note body; legacy `#flag/` tags in body; `#status/` tags in body; untyped connections (lines in `## Connections` not matching `:: [[`); connection count > 7; missing `## Breadcrumb` on BRANCH or LEAF; callout flag count > 3.
2. Reports `Lint complete. 0 issues in N notes.` when no violations found.
3. Accepts `vault=` and folder path parameters: `cli-lint.sh vault=study projects/aws`.
4. Excludes files matching `tpl-*`, `_vocab*`, `_topk*`, `_ontology*` from lint scope.
5. Exits 0 with findings on stdout; exits 1 only on script-level errors.
6. Emits JSON when `--json` flag passed: `{"vault":"study","folder":"...","issues":[{"file":"...","rule":"...","message":"..."}],"count":N}`.
7. `tests/test-cli-lint.sh` passes in the test harness (includes deliberately malformed notes to verify detection).

**Context**
Depends on Story 003 (lib.sh), Story 006 (entities to lint). Sources `lib.sh`. Uses `app.metadataCache.getFileCache(f)?.frontmatter` for property reads and `app.vault.cachedRead(f)` for body inspection. Extract `## Connections` section with regex `/^## Connections[\s\S]*?(?=^## |\Z)/m`. The `--json` flag output is consumed by the Auditor subagent (Story 021) for programmatic triage.

---

### Story 010 — Implement cli-orphans.sh reflex skill

**Description**
Author `cli-orphans.sh` in `~/.ontology-cli/core/` to verify bidirectional parent↔children link integrity across all project notes using Obsidian's metadata cache. This reflex skill detects four failure modes: BRANCH/LEAF with no parent, parent reference to a non-existent note, parent that does not list this note as a child, and child listed by a parent whose `parent` field does not match.

**Acceptance criteria**
1. Detects BRANCH or LEAF with no `parent` field: `✗ ORPHAN: <note> (<type>) has no parent`.
2. Detects broken parent references (wikilink resolves to no file): `✗ BROKEN: <note> → parent '<n>' not found`.
3. Detects parent/child mismatch: `✗ MISMATCH: <note> parent='<p>', parent doesn't list it as child`.
4. Detects reverse mismatch (parent lists child that doesn't exist): `✗ BROKEN: <parent> lists child '<n>' — not found`.
5. Reports `Link check complete. 0 issues in N notes.` when no issues found.
6. Emits JSON when `--json` flag: `{"issues":[{"type":"ORPHAN|BROKEN|MISMATCH","note":"...","detail":"..."}],"count":N}`.
7. Excludes ROOT notes from the "no parent" check — ROOT has empty parent by design.
8. `tests/test-cli-orphans.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 006 (entities to audit). Sources `lib.sh`. Uses `app.metadataCache.getFileCache(f)?.frontmatter` for parent/children property reads; uses `app.vault.getAbstractFileByPath` to verify existence of referenced notes. Never use `grep` for path resolution — the metadata cache handles aliased wikilinks correctly.

---

### Story 011 — Implement cli-relations.sh reflex skill

**Description**
Author `cli-relations.sh` in `~/.ontology-cli/core/` to enumerate all typed connections in a project as a source→rel→target edge list, validate each relationship type against the project's `_ontology.[project].md`, and emit a usage summary. This sensory-reflex skill provides the Auditor subagent with the full relationship graph.

**Acceptance criteria**
1. For each note in scope, extracts `- <rel> :: [[<target>]]` lines from `## Connections` and emits: `<source> --<rel>--> <target>`.
2. Validates each `<rel>` against `_ontology.[project].md`; emits `⚠ Unknown relationship type: '<rel>'` for unrecognized types without halting.
3. Emits a summary block: count per relationship type, sorted descending by count.
4. Accepts `vault=` and folder parameters; excludes `_vocab*`, `_topk*`, `_ontology*`, `tpl-*`.
5. Emits JSON when `--json`: `{"edges":[{"source":"...","rel":"...","target":"...","context":"..."}],"summary":{"depends-on":3,...},"unknownTypes":["..."]}`.
6. Exits 0 in all cases.
7. `tests/test-cli-relations.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 007 (connections to audit). Sources `lib.sh`. Parses `## Connections` section body with `app.vault.cachedRead` and a line-level regex. Loads valid relationship types from `_ontology.[project].md` using `obsidian eval` to read the file and `awk` to extract the first column of the `## Relationship Types` table.

---

### Story 012 — Implement sync-vocab.sh autonomic skill

**Description**
Author `sync-vocab.sh` in `~/.ontology-cli/core/` to rebuild a project's `_vocab.[project].md` from note metadata, detecting spine overflow and orphan terms. This autonomic skill fires during the weekly review cycle to keep the vocabulary index current with vault content.

**Acceptance criteria**
1. `sync-vocab.sh study aws` rebuilds `_vocab.aws.md` with a vocabulary tree grouped by spine (L0–L3), flags BRANCH children > 7 and LEAF children > 5 as overflows, lists notes without spine under `## Orphan Terms`, and updates the `updated:` frontmatter date.
2. Re-running produces no additional entries or duplicate rows (idempotent).
3. Accepts `vault=` parameter; exits 0 on success, 1 on error.
4. `tests/test-sync-vocab.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 009 (lint validates data sync reads). Sources `lib.sh`. Reads `type`, `spine`, `children` from all project notes via `obsidian eval`. BRANCH children > 7 and LEAF children > 5 thresholds are defined in the project's `_topk` limits table.

---

### Story 013 — Implement sync-topk.sh autonomic skill

**Description**
Author `sync-topk.sh` in `~/.ontology-cli/core/` to append rows to a project's `_topk.[project].md` overflow log for any note exceeding connection, callout flag, or children limits, without duplicating existing entries.

**Acceptance criteria**
1. `sync-topk.sh study aws` appends a row to `_topk.aws.md`'s `## Overflow Log` for each note exceeding 7 connections, 3 callout flags, or 7 BRANCH children; never duplicates entries for the same note+field combination; updates `updated:` date.
2. Re-running produces no additional entries or duplicate rows (idempotent).
3. Accepts `vault=` parameter; exits 0 on success, 1 on error.
4. `tests/test-sync-topk.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 009 (lint validates data sync reads). Sources `lib.sh`. Reads `## Connections` line count and callout flag count per note via `app.vault.cachedRead`. Deduplication checks the existing overflow log for a matching note+field row before appending.

---

### Story 014 — Implement sync-ontology.sh autonomic skill

**Description**
Author `sync-ontology.sh` in `~/.ontology-cli/core/` to produce a comprehensive health report for a project: entity distribution, relationship usage, missing inverse detection, and schema completeness. This is the most thorough autonomic diagnostic — it cross-references all forward connections against their declared inverses.

**Acceptance criteria**
1. `sync-ontology.sh study aws` produces a report containing: entity type counts, kind distribution, spine distribution, status distribution, relationship type usage counts, list of missing inverses (A→B exists but B→A does not), schema completeness count, and a summary line: `Total: N notes, M edges, avg X.X edges/note, P incomplete, Q missing inverses`.
2. Re-running produces an identical report (idempotent).
3. Accepts `vault=` parameter; exits 0 on success, 1 on error.
4. Emits JSON when `--json`: `{"entities":{"ROOT":N,"BRANCH":N,"LEAF":N},"edges":M,"missingInverses":[{"source":"...","rel":"...","target":"..."}],"incomplete":P}`.
5. `tests/test-sync-ontology.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 011 (cli-relations provides edge data). Sources `lib.sh`. Cross-references all forward connections against their inverses — for each `A --rel--> B`, verifies B has `inverse(rel) :: [[A]]` in its Connections section. Inverse lookup uses the project's `_ontology` relationship types table.

---

### Story 015 — Implement weekly-review.sh and morning.sh orchestration skills

**Description**
Author `weekly-review.sh` in `~/.ontology-cli/core/` as a one-command orchestrator that executes `cli-lint`, `cli-orphans`, `cli-relations`, `sync-ontology`, `sync-vocab`, `sync-topk`, and `obsidian unresolved` in sequence, then appends a timestamped summary to the current daily note. Author `morning.sh` as the daily startup script. These are the highest-level autonomic skills — the Auditor subagent invokes `weekly-review.sh` when the user requests a review.

**Acceptance criteria**
1. `weekly-review.sh study aws` runs all 7 sub-commands in sequence; total runtime < 30 seconds for a 100-note vault.
2. Appends a structured summary to today's daily note under `## Ontology Work Log` containing: lint issue count, orphan count, unknown relation types, missing inverses, overflow violations, unresolved links count, and a `Review complete: YYYY-MM-DD HH:MM` timestamp.
3. Exits 0 when all sub-commands exit 0; exits 1 with the failing command name on stderr when any sub-command fails.
4. `morning.sh` executes: `obsidian daily` (opens daily note), `obsidian daily:append` with inbox backlog count, `obsidian files sort=modified limit=10 --copy`, `obsidian unresolved`.
5. `weekly-review.sh --json` emits: `{"lint":{"issues":N},"orphans":{"issues":N},"relations":{"unknown":N},"ontology":{"missingInverses":N},"unresolved":N}`.
6. A cron entry `0 8 * * 1-5 ~/.ontology-cli/core/morning.sh` executes `morning.sh` on weekdays at 08:00.
7. `tests/test-weekly-review.sh` passes in the test harness.

**Context**
Depends on Stories 009–014. Sources `lib.sh`. `weekly-review.sh` captures each sub-command's exit code and stdout/stderr individually; collects all findings before the daily note append to avoid partial writes. The Auditor subagent (Story 021) invokes `weekly-review.sh --json` and triages findings by severity: broken links > missing inverses > lint violations > stale drafts.

---

### Story 016 — Implement context.sh primary sensory skill

**Description**
Author `context.sh` in `~/.ontology-cli/core/` as the primary AI interface for vault retrieval — it scores all project notes by relevance to a natural language query using a weighted multi-factor scoring model and returns the top N results with full structural context as JSON. This is the most critical sensory nerve: the Researcher subagent invokes it before answering any knowledge question, enforcing the vault-first retrieval rule.

**Acceptance criteria**
1. Scoring weights applied per result: title match +10, alias match +8, kind match +5, spine match +4, body term frequency +1 per occurrence (capped at +5 total), tag match +3.
2. Returns JSON: `{"query":"...","vault":"...","results":[{"path":"...","title":"...","type":"...","kind":"...","spine":"...","status":"...","parent":"...","children":[...],"aliases":[...],"breadcrumb":"...","summary":"<## Summary text>","content":"<## Content truncated to 2000 chars>","connections":[{"rel":"...","target":"...","context":"..."}]}]}`.
3. Default limit is 5 results; configurable: `context.sh study "S3 lifecycle" 3`.
4. Runtime < 5 seconds for a 200-note vault.
5. Returns `{"results":[]}` with exit 0 when no notes match — never exits non-zero for empty results.
6. Accepts `vault=` parameter.
7. The `breadcrumb` field is reconstructed by traversing `parent` frontmatter links up to ROOT, capped at 5 hops.
8. `tests/test-context.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh). Sources `lib.sh`. Implements scoring via `obsidian eval` JavaScript: iterate `app.vault.getMarkdownFiles()`, for each file retrieve frontmatter via `app.metadataCache.getFileCache(f)?.frontmatter` and body via `app.vault.cachedRead(f)`, compute score, sort descending, slice to limit. Content is truncated to 2000 characters to prevent context window overflow in agent responses.

---

### Story 017 — Implement get-entity.sh sensory skill

**Description**
Author `get-entity.sh` in `~/.ontology-cli/core/` to return full entity detail as structured JSON: all frontmatter fields, all body sections parsed, backlinks from metadata cache, and resolved outgoing links. This sensory skill gives agents precise structural context for a specific entity without requiring a full vault search.

**Acceptance criteria**
1. `get-entity.sh study "TESTPROJ.note-a"` finds the note by basename or partial match and returns: `{"path":"...","frontmatter":{...},"sections":{"Summary":"...","Content":"...","Connections":"..."},"backlinks":[{"path":"...","title":"...","type":"..."}],"outgoing":[{"path":"...","title":"...","display":"..."}]}`.
2. Backlinks are retrieved from `app.metadataCache.getBacklinksForFile(f).data` — not from grep.
3. Emits a clear error to stderr and exits 1 if no note matches the search term.
4. Sections parsed by splitting on `## ` heading boundaries; section content trimmed and truncated to 3000 characters.
5. `tests/test-get-entity.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 006 (entities to retrieve). Sources `lib.sh`. Outgoing links resolved via `app.metadataCache.resolveSubpath`. Partial match searches both `file.basename` and `frontmatter.aliases`.

---

### Story 018 — Implement get-tree.sh sensory skill

**Description**
Author `get-tree.sh` in `~/.ontology-cli/core/` to return the complete hierarchical note tree for a project as nested JSON. This skill gives the agent the full shape of a project's knowledge graph in a single call.

**Acceptance criteria**
1. `get-tree.sh study aws` returns: `{"folder":"projects/aws","nodeCount":N,"tree":[{"path":"...","title":"...","type":"ROOT","subtree":[{"type":"BRANCH","subtree":[{"type":"LEAF"}]}]}]}`.
2. Missing children (wikilink in parent's `children:` resolves to no file) are represented as `{"missing":"<n>"}` nodes in the subtree.
3. Cycle detection is implemented — a child pointing back to an ancestor is flagged as `{"cycle":"<path>"}` rather than causing infinite recursion.
4. Accepts `vault=` parameter.
5. `tests/test-get-tree.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 006 (entities to traverse). Sources `lib.sh`. Builds the nested structure recursively starting from ROOT nodes; tracks visited paths in a `Set` to detect cycles.

---

### Story 019 — Implement knowledge gap and topic explanation skills

**Description**
Author `get-knowledge-gap.sh` to identify structural deficiencies across a project (stubs, isolated nodes, drafts, missing fields, low link count, unresolved links), and `explain-topic.sh` to assemble a teaching bundle for a queried topic (primary note, parent, siblings, and connected notes' summaries). These sensory skills enable the Researcher subagent to surface vault gaps and assemble full teaching context from available knowledge.

**Acceptance criteria**
1. `get-knowledge-gap.sh study aws` returns JSON: `{"stubs":[{"note":"...","words":N}],"noConnections":[...],"drafts":[{"note":"...","kind":"...","spine":"..."}],"missingFields":[{"note":"...","missing":["kind","spine"]}],"lowLinkCount":[{"note":"...","links":N}],"unresolvedLinks":[{"note":"...","broken":["[[BadRef]]"]}]}`.
2. Stubs defined as notes with body word count < 100 (excluding frontmatter). Low link count defined as ROOT or BRANCH with < 2 outgoing links.
3. `explain-topic.sh study "S3 lifecycle"` returns: `{"primary":{<full entity>},"parent":{"title":"...","summary":"..."},"siblings":[{"title":"...","summary":"..."}],"connected":[{"title":"...","summary":"...","kind":"...","rel":"..."}]}`.
4. `explain-topic.sh` locates the note via `context.sh` (highest-scoring match), then assembles parent/sibling/connected context using `app.metadataCache`.
5. Siblings are all notes whose `parent` field matches the primary note's `parent`.
6. When the primary note is ROOT (no parent), `parent` is set to `null` in the output.
7. `tests/test-knowledge-gap.sh` and `tests/test-explain-topic.sh` pass in the test harness.

**Context**
Depends on Story 016 (`context.sh` for topic location), Story 017 (`get-entity.sh` for detail). Sources `lib.sh`. Word count computed by reading body text (excluding frontmatter) and splitting on whitespace. Unresolved links detected by checking each wikilink against `app.metadataCache.getFirstLinkpathDest` — null result indicates a broken link.

---

### Story 020 — Author CLAUDE.md agent configs and skill registry

**Description**
Create per-vault `CLAUDE.md` files for `study` and `dev-projectA`, and create the shared skill registry at `~/.ontology-cli/agent/skills.md`. The `CLAUDE.md` files are the agent nervous system configuration — they specify persona, active projects, skill invocation rules, and routing logic that Claude Code reads at session start. The skill registry maps intent to CLI command.

**Acceptance criteria**
1. `study/CLAUDE.md` specifies: vault name, active projects list, persona Study Coach, and all 6 rules: (a) invoke `context.sh` before answering any knowledge question; (b) cite the source note path in every vault-grounded answer; (c) invoke `create-entity.sh` exclusively for all note creation; (d) invoke `add-connection.sh` for all connections; (e) invoke `weekly-review.sh --json` for all review requests; (f) offer to save new knowledge after teaching from training data.
2. `dev-projectA/CLAUDE.md` specifies the same 6 rules plus: invoke `adr.sh` for architecture decisions, invoke `dependency-map.sh` for system dependency queries.
3. `~/.ontology-cli/agent/skills.md` enumerates all skills in groups: Context Retrieval, CRUD, Maintenance, Study, Dev — each entry specifies name, CLI command, input parameters, output format (JSON/text), and the intent trigger that activates it.
4. A `## Quick Reference` section in each `CLAUDE.md` lists the 5 most-frequently invoked skill signatures to minimize lookup overhead per agent turn.
5. Opening either vault in Claude Code and asking "what vault am I in?" causes Claude to reference the CLAUDE.md vault name.
6. Asking a knowledge question causes Claude to invoke `context.sh` — verifiable from tool call logs.

**Context**
Depends on Story 016 (`context.sh` must exist before the CLAUDE.md rule references it). Rules in `CLAUDE.md` must use imperative language and explicit conditions. The skill registry is a reference document — Claude reads it as part of session context to know what skills are available. Place the `context.sh` rule first so it is evaluated before creation or connection rules on every turn.

---

### Story 021 — Implement agent subagent patterns and routing logic

**Description**
Author the Researcher, Writer, Linker, and Auditor subagent behavioral patterns as documented decision trees in `~/.ontology-cli/agent/patterns.md`, and verify routing through live Claude Code sessions against both vaults. These patterns encode the signal-routing logic of the nervous system: which user intent triggers which skill sequence, and how the agent composes multiple skills into a complete response.

**Acceptance criteria**
1. Researcher pattern verified: knowledge question → `context.sh` invoked → if results non-empty, answer grounded in vault content with note path cited; if results empty, answer from training data + `create-entity.sh` offer.
2. Writer pattern verified: "save/create/add" intent → `create-entity.sh` invoked with correct type inference (LEAF for atomic content, BRANCH when content implies sub-topics) → `add-connection.sh` invoked if connections mentioned → daily note log confirmed.
3. Linker pattern verified: "connect/link/wire" intent → `add-connection.sh` invoked → inverse written on target → warning emitted if source note is at the 7-connection limit.
4. Auditor pattern verified: "review/audit" intent → `weekly-review.sh --json` invoked → findings triaged by severity (broken links > missing inverses > lint > stale drafts) → programmatic fix offered per category; `_inbox/_rollback-log.md` included in triage scope.
5. Multi-vault routing verified: ambiguous vault reference causes Claude to query `"Which vault: study or dev-projectA?"` before invoking any CLI skill.
6. `## Failure Modes` section documented: when a CLI skill exits non-zero, the agent retries once, then reports the error verbatim to the user — it never silently swallows a failed skill invocation.
7. All 5 routing cases documented in `patterns.md` with intent trigger, skill invocation sequence, expected output, and failure mode handling.

**Context**
Depends on Stories 015–020. Test via live Claude Code sessions; use `--verbose` or tool-call logs to verify skill invocations. CLAUDE.md rule ordering matters — the `context.sh` rule must appear first.

---

### Story 022 — Implement study-specific skills and Quizmaster integration

**Description**
Author three study-domain skills in `~/.ontology-cli/study/`: `coverage.sh` (maps spine branches to certification domains and reports % stable per domain), `quiz.sh` (extracts summaries and connections from stable/review notes formatted for AI quiz generation), and `progress.sh` (study progress dashboard as JSON). Extend `patterns.md` with the Quizmaster subagent decision tree.

**Acceptance criteria**
1. `coverage.sh study aws` returns JSON: `{"project":"aws","domains":[{"spine":"...","total":N,"stable":N,"review":N,"draft":N,"coverage":X.X}],"overall":{"totalNotes":N,"avgCoverage":X.X}}` — coverage is `stable / total * 100` rounded to 1 decimal place.
2. `quiz.sh study aws storage 5` returns JSON: `{"instruction":"<quiz generation instruction>","spine":"storage","notes":[{"title":"...","kind":"...","summary":"...","content":"<first 500 chars>","connections":[...]}]}` — shuffled, limited to 5 entries, excluding drafts.
3. `progress.sh study aws` returns JSON: `{"project":"aws","notes":{"total":N,"stable":N,"review":N,"draft":N},"completion":X.X,"knowledge":{"totalWords":N,"totalEdges":N,"avgEdgesPerNote":X.X},"thisWeek":["<basename>",...]}`  — `thisWeek` contains basenames of notes modified in the last 7 days.
4. Quizmaster pattern documented in `patterns.md`: "quiz me on X" intent → `quiz.sh` invoked → questions generated from vault content only → after quiz, weak areas mapped to specific note paths → user offered to review or enrich those notes.
5. All three scripts accept `vault=` parameter; exit 0 on success, 1 on error.
6. The `instruction` field in `quiz.sh` enforces vault-grounded questions only, rejecting questions requiring external knowledge not present in the provided note content.
7. `tests/test-coverage.sh`, `tests/test-quiz.sh`, and `tests/test-progress.sh` pass in the test harness.

**Context**
Depends on Story 021 (agent patterns framework), Story 016 (`context.sh` for Quizmaster topic location). Sources `lib.sh`. `quiz.sh` shuffles note order using `sort -R` (macOS built-in, zero installs).

---

### Story 023 — Implement dev-specific skills

**Description**
Author three dev-domain skills in `~/.ontology-cli/dev/`: `adr.sh` (creates an Architecture Decision Record as a LEAF note with `kind: decision` and structured Content sections), `dependency-map.sh` (filters the relationship graph to `depends-on` edges as JSON), and `code-link.sh` (appends a code reference to a note's `## Connections`).

**Acceptance criteria**
1. `adr.sh dev-projectA svc "Use PostgreSQL for session storage"` creates a LEAF note with frontmatter `type: LEAF`, `kind: decision`, `decision-date: YYYY-MM-DD`, `decision-status: proposed`; `## Content` contains subsections `### Context`, `### Decision`, `### Consequences`.
2. Parent note's `children:` array is updated with the ADR wikilink; daily note is appended with the creation entry.
3. `dependency-map.sh dev-projectA svc` returns JSON: `{"project":"svc","edges":[{"source":"...","target":"...","context":"..."}]}` — only `depends-on` edges included.
4. `code-link.sh dev-projectA "projects/svc/SVC.auth - Auth Service.md" "src/auth/handler.ts"` appends `- implements :: \`src/auth/handler.ts\`` to `## Connections`; re-running the same command exits 0 with no duplicate line added (idempotent).
5. All three scripts accept `vault=` parameter; exit 0 on success, 1 on error.
6. `tests/test-adr.sh`, `tests/test-dependency-map.sh`, and `tests/test-code-link.sh` pass in the test harness.

**Context**
Depends on Story 021 (agent patterns), Story 007 (`add-connection.sh` reused by `adr.sh` for parent wiring), Story 008 (CRUD patterns). `adr.sh` generates the slug from the title: lowercase, replace spaces with `-`, prepend `adr-YYYYMMDD-`. `dependency-map.sh` is a thin wrapper around `cli-relations.sh --json` filtered to `rel === "depends-on"`. `code-link.sh` uses `app.vault.process` for atomic write; idempotency check scans the existing Connections body for the exact code path string before writing.

---

### Story 024 — Implement schema migration skill

**Description**
Author `migrate.sh` in `~/.ontology-cli/core/` to apply bulk schema changes to a project's notes from a declarative migration spec: rename relationship types, rename or merge spines, add new frontmatter fields with default values, promote LEAF notes to BRANCH (updating type, adding `children: []`, moving file if naming convention changes), and update `_ontology` / `_vocab` / `_topk` artifacts to reflect the new schema. Without this skill, schema evolution requires manual editing of every affected note.

**Acceptance criteria**
1. `migrate.sh study aws /tmp/migration.json` reads a JSON migration spec and applies all operations in order.
2. Supported operations: `rename-rel` (renames a relationship type across all `## Connections` sections and `_ontology`), `rename-spine` (updates `spine` frontmatter on all matching notes and `_vocab`), `add-field` (adds a frontmatter field with a default value to all notes matching a filter), `promote` (changes a LEAF to BRANCH: updates `type`, adds `children: []`, renames file to BRANCH convention via `app.fileManager.renameFile`).
3. Each operation emits a log line: `Applied <operation> to N notes`.
4. A `--dry-run` flag reports what would change without modifying any files.
5. Re-running an already-applied migration exits 0 with `0 notes modified` for each operation (idempotent).
6. Before applying, validates the migration spec and exits 1 with specific errors if any operation references non-existent relationship types, spines, or note paths.
7. Appends a migration summary to the daily note and updates `_ontology` / `_vocab` `updated:` dates.
8. `tests/test-migrate.sh` passes in the test harness.

**Context**
Depends on Story 003 (lib.sh), Story 007 (connection writes), Story 012 (sync-vocab for artifact updates). Sources `lib.sh`. Migration spec format: `[{"op":"rename-rel","from":"triggers","to":"activates"},{"op":"promote","note":"TESTPROJ.leaf-a"}]`. The `rename-rel` operation must update both forward and inverse entries in `_ontology`, and rewrite all matching connection lines across all project notes. The `promote` operation uses `app.fileManager.renameFile` which auto-updates all wikilinks — document this dependency on the move pattern from Story 008.

---

### Story 025 — Build and execute E2E test suite

**Description**
Author `~/.ontology-cli/core/e2e-study.sh` and `~/.ontology-cli/core/e2e-dev.sh` as comprehensive end-to-end lifecycle tests that go beyond the incremental test harness by exercising full multi-skill workflows: project creation through weekly review, agent pattern verification, and migration. These tests validate the complete nervous system as an integrated whole.

**Acceptance criteria**
1. `e2e-study.sh` passes all criteria: project created via `create-project.sh`, 3-level entity tree created via `create-entity.sh`, connections with inverses written via `add-connection.sh`, `cli-lint` / `cli-orphans` / `cli-relations` all clean, `sync-vocab` / `sync-topk` / `sync-ontology` produce correct artifacts, `coverage.sh` and `progress.sh` return valid JSON, `weekly-review.sh` appends to daily note, `context.sh` returns the created entities for a matching query.
2. `e2e-dev.sh` passes: project scaffolded, ADR created with correct frontmatter and sections, code-link idempotency verified, dependency-map returns correct edges, weekly-review exits clean.
3. Both scripts create a disposable test project at the start, run all assertions, and clean up at the end — leaving no artifacts in the vault.
4. Both scripts exit 0 only when all assertions pass; exit 1 with failing assertion names on stderr.
5. Total runtime < 120 seconds per script for a vault with ≤ 200 existing notes.
6. JSON output validated via `python3 -m json.tool` (macOS built-in, zero installs).
7. `test-harness.sh study` (incremental tests from Stories 005–024) also runs clean as a prerequisite check.

**Context**
Depends on all prior stories. Cleanup uses `obsidian eval`: `const folder=app.vault.getAbstractFileByPath('projects/_test-e2e'); await app.vault.trash(folder, false)`. The E2E tests complement the incremental test harness — the harness tests individual skills in isolation while the E2E tests validate multi-skill composition and data flow between skills.

---

### Story 026 — Validate documentation and cross-references

**Description**
Audit the v11 framework document, the Ontology CLI companion guide, and the Agent Layer document for accuracy, completeness, and internal consistency. Verify every CLI example executes successfully, every cross-reference resolves, and every limitation is documented. This is a validation checklist, not a writing task — all documentation content is authored incrementally in the stories that produce each skill.

**Acceptance criteria**
1. v11 §2.11 correctly references the CLI registration procedure from Story 002; §20 (Triage and Weekly Review workflows) references `create-entity.sh`, `add-connection.sh`, and `weekly-review.sh` by their exact command signatures; §22 (Decomposition Flow) maps each step to its corresponding CLI skill.
2. Ontology CLI companion guide documents all skills from Stories 005–024 with: command signature, all parameters including `vault=` and `--json`, example invocation, example output, and idempotency behavior.
3. Agent Layer document contains: `CLAUDE.md` template for each vault type, skill registry listing all capabilities grouped by subagent, `patterns.md` decision trees for all routing cases, and a `## Limitations` section covering all limitations (L1–L5, L7–L8; L6 iOS limitation removed as out of scope).
4. All CLI example invocations in all three documents execute successfully against the test vault from Story 025.
5. No broken cross-references exist between the three documents.
6. `_inbox/_rollback-log.md` recovery workflow is documented in the Agent Layer document's failure modes section.
7. `migrate.sh` migration spec format and supported operations are documented in the Ontology CLI companion guide.