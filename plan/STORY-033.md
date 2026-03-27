---
title: 'Migrate motor skills to TypeScript with unit and integration tests'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 8
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-033'
phase: 7
sequence: 3
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-031
  - STORY-032
blocks:
  - STORY-035
  - STORY-037
decisionGate: ~
validationBasis: 'bun test src/commands/__tests__/create-*.test.ts and bun test src/commands/__tests__/add-connection.test.ts and bun test src/commands/__tests__/import-json.test.ts all pass; bun test tests/integration/motor/ passes with OBSIDIAN_RUNNING=1'
---

## Goal

Port `create-project.sh`, `create-entity.sh`, `add-connection.sh`, and `import-json.sh` from Bash to TypeScript command modules in `src/commands/`.
Each command uses the typed templates from STORY-032 and the core library from STORY-031.
Unit tests mock `obEval` to validate all business logic without Obsidian.
Integration tests (ported from Bash `test-*.sh` files) run against a live Obsidian instance.

## Acceptance criteria

### create-project

- [ ] `src/commands/create-project.ts` exports a `Command` satisfying the interface from STORY-031
- [ ] `nerv create-project <vault> <slug> "<Title>"` scaffolds 5 files: ROOT note, `_ontology.<slug>.md`, `_vocab.<slug>.md`, `_topk.<slug>.md`, `<slug>.base` — using `renderRoot`, `renderOntology`, `renderVocab`, `renderTopk`, `renderBase` from STORY-032
- [ ] Validates slug against `/^[a-z0-9-]+$/`; exits 1 with descriptive error on invalid slug
- [ ] Idempotent: exits 0 with no modification if `projects/<slug>/` already exists
- [ ] Accepts `vault=<name>` keyword argument form

### create-entity

- [ ] `src/commands/create-entity.ts` accepts 8 positional parameters: `vault`, `project`, `TYPE`, `slug`, `title`, `parent_slug`, `kind`, `[spine]`; plus `--json` flag
- [ ] Creates note file at `projects/<slug>/<UPPER>.<note-slug> - <Title>.md` using the correct template (`renderLeaf`, `renderBranch`, or `renderRoot`) from STORY-032
- [ ] Updates parent note's `children:` YAML array atomically via a single `processFrontMatter` `obEval` call — appends `[[<basename>]]` wikilink; no duplicate if already present
- [ ] Inherits `spine` from parent when the `[spine]` argument is omitted — reads parent frontmatter via `obEval`
- [ ] Logs creation to daily note via `dailyAppend()` from `lib/obsidian.ts`
- [ ] On partial failure (note created but parent update fails), writes to `_inbox/_rollback-log.md` via `rollbackLog()`
- [ ] Idempotent: exits 0 with no modification if note already exists
- [ ] `--json` flag emits `{"created": boolean, "path": "...", "title": "..."}`; error case emits `{"created": false, "error": "..."}`
- [ ] Missing parent exits 1 with descriptive error (or `{"created": false, "error": "..."}` in JSON mode)

### add-connection

- [ ] `src/commands/add-connection.ts` accepts: `vault`, `source-path`, `rel-type`, `target-path`, `[context]`
- [ ] Appends `- <rel-type> :: [[<target-basename>]]` to source note's `## Connections` section via atomic `vault.process` `obEval` call
- [ ] Writes inverse connection on target note automatically (looks up inverse rel-type from `_ontology.<slug>.md`)
- [ ] Idempotent: checks `content.includes(line)` before appending; skips duplicate silently
- [ ] Enforces maximum 7 connections per note; exits 1 with warning if limit exceeded

### import-json

- [ ] `src/commands/import-json.ts` reads JSON file via `Bun.file(path).json()` — zero Python dependency
- [ ] Iterates array entries, calls the `create-entity` module function directly (not a subprocess)
- [ ] Skips existing notes; reports `Created: N, Skipped: M` on completion
- [ ] Extra JSON properties beyond the standard schema pass through to frontmatter

### Tests

- [ ] `src/commands/__tests__/create-project.test.ts`: mocks `obEval`; tests slug validation (valid, invalid, empty), idempotency (mock returns "exists"), file path generation; at least 5 assertions
- [ ] `src/commands/__tests__/create-entity.test.ts`: mocks `obEval`; tests path generation for LEAF/BRANCH/ROOT, parent wiring logic, spine inheritance, `--json` output schema, missing-parent error; at least 8 assertions
- [ ] `src/commands/__tests__/add-connection.test.ts`: mocks `obEval`; tests idempotency, inverse wiring, 7-connection limit enforcement; at least 5 assertions
- [ ] `src/commands/__tests__/import-json.test.ts`: mocks `obEval` and `Bun.file`; tests skip/create counting, extra field passthrough; at least 4 assertions
- [ ] `tests/integration/motor/create-entity.integration.test.ts`: ports all assertions from `cli/core/tests/test-create-entity.sh` (file exists, frontmatter fields, parent children update, spine inheritance, idempotency, `--json` output, missing parent error); requires `OBSIDIAN_RUNNING=1`
- [ ] `tests/integration/motor/create-project.integration.test.ts`: ports assertions from `cli/core/tests/test-create-project.sh`; requires `OBSIDIAN_RUNNING=1`
- [ ] `bun test src/commands/__tests__/` exits 0 without Obsidian; `bun test tests/integration/motor/` exits 0 with `OBSIDIAN_RUNNING=1`

## Additional information

The motor skills are the most heavily composed modules in the codebase — `import-json` calls `create-entity`, which calls templates and `obEval`.
The TypeScript port changes the composition model from subprocess spawning (`bash "$CREATE_ENTITY" ...`) to direct function import — eliminating shell overhead and enabling typed error propagation.

> [!important]
> `create-entity` must expose both a CLI entry point (`run(args)` for the dispatcher) and a programmatic API (`createEntity(params): Promise<CommandResult>`) so that `import-json` and `adr.sh` (STORY-037) can call it as a function, not a subprocess. This dual-export pattern applies to all commands that are composed by other commands.

## System design

- [PLAN.md — Story 033](../PLAN.md)
- [cli/core/create-project.sh — Bash source](../../cli/core/create-project.sh)
- [cli/core/create-entity.sh — Bash source](../../cli/core/create-entity.sh)
- [cli/core/add-connection.sh — Bash source](../../cli/core/add-connection.sh)
- [cli/core/import-json.sh — Bash source](../../cli/core/import-json.sh)
- [cli/core/tests/test-create-entity.sh — integration test source](../../cli/core/tests/test-create-entity.sh)

## Resources

- [Bun.file API for JSON reading](https://bun.sh/docs/api/file-io): `const data = await Bun.file("/tmp/notes.json").json()` reads and parses JSON in a single call; replaces `python3 -c "import json,sys; data=json.load(sys.stdin)"`
- [bun:test describe/it pattern](https://bun.sh/docs/test/writing): `describe("create-entity", () => { it("creates LEAF with correct path", async () => { ... }) })` for structured test output
- [Obsidian `processFrontMatter` API](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter): the JS expression passed to `obEval` must use `processFrontMatter(f, fm => { ... })` for atomic YAML mutations — never raw string replacement

## Recommendations

- Extract a `resolveNotePath(project: string, type: EntityType, slug: string, title: string): string` pure function for path generation — this is the most unit-testable part of create-entity and the source of most Bash bugs (uppercase conversion, slug formatting)
- Use `beforeAll` / `afterAll` in integration tests to create + trash a disposable test project, matching the pattern in `test-harness.sh`'s `setup()` / `teardown()`
- Add integration test timing: if any single integration test takes > 10 seconds, mark it as slow with `test.todo` and investigate — the Obsidian eval round-trip should be < 2 seconds per call

## Security considerations

| Area            | Risk                                                                                     | Mitigation                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Slug injection  | A malicious slug like `../../.obsidian/config` could write outside the project directory | Validate slug with `/^[a-z0-9-]+$/` before any file operation                                                     |
| JSON import     | `import-json.ts` creates files from external JSON                                        | Validate all generated paths start with `projects/<slug>/` before calling `obEval` with `vault.create`            |
| Shell injection | Field values embedded in `obEval` JS expressions                                         | All user-supplied strings pass through `encodeForJs()` from `lib/json.ts` before embedding in JS template strings |

---

> **Blocks**:
>
> - STORY-035 ⛔ — Sensory skills migration (sensory skills compose motor skills)
> - STORY-037 ⛔ — Domain skills migration (adr.sh calls create-entity module)
