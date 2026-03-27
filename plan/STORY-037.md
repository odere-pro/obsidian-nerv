---
title: 'Migrate domain skills (study + dev) to TypeScript with tests'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 5
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-037'
phase: 7
sequence: 5
parallelTrack: B
size: 'M — ~0.5 day'
dependsOn:
  - STORY-033
blocks:
  - STORY-038
decisionGate: ~
validationBasis: 'bun test src/commands/__tests__/dev/ and src/commands/__tests__/study/ pass; bun test tests/integration/domain/ passes with OBSIDIAN_RUNNING=1'
---

## Goal

Port the six domain-specific skills from Bash to TypeScript command modules: study domain (`coverage.sh`, `progress.sh`, `quiz.sh`) in `src/commands/study/` and dev domain (`adr.sh`, `dependency-map.sh`, `code-link.sh`) in `src/commands/dev/`.
`adr.ts` composes the `createEntity` programmatic API from STORY-033 directly — no subprocess.
`dependency-map.ts` composes the `getRelations` programmatic API from STORY-034 directly.

## Acceptance criteria

### Dev domain

- [ ] `src/commands/dev/adr.ts` creates an ADR note via `createEntity()` import from STORY-033 with: `kind: decision`, `decision-date: YYYY-MM-DD`, `decision-status: proposed`; body contains `### Context`, `### Decision`, `### Consequences` subsections
- [ ] ADR slug generated from title: lowercase, spaces to `-`, non-alphanumeric stripped, prepended with `adr-YYYYMMDD-`
- [ ] Parent note's `children:` updated; daily note appended with creation entry (inherited from `createEntity`)
- [ ] `src/commands/dev/dependency-map.ts` calls `getRelations()` import from STORY-034, filters to `depends-on` edges only, returns JSON: `{"project":"...","edges":[{"source":"...","target":"...","context":"..."}]}`
- [ ] `--format dot` flag outputs GraphViz DOT format in addition to JSON default
- [ ] `src/commands/dev/code-link.ts` appends `- implements :: \`<codepath>\``to`## Connections`; uses atomic `vault.process`via`obEval`
- [ ] Idempotent: `code-link` scans existing Connections body for exact code path string before writing; exits 0 with no duplicate
- [ ] Validates `CODEPATH` does not contain `]]` (breaks wikilink syntax) or newlines (breaks Connections section); exits 1 with descriptive error on invalid input

### Study domain

- [ ] `src/commands/study/coverage.ts` scans all LEAF and BRANCH notes in a project, computes coverage metrics (word count, connection count, status distribution), returns JSON
- [ ] `src/commands/study/progress.ts` tracks daily knowledge acquisition: notes created, connections added, notes promoted; compares against a configurable daily target
- [ ] `src/commands/study/quiz.ts` generates review questions from a random subset of notes in a project using frontmatter and summary content; returns JSON array of question objects

### Tests

- [ ] `src/commands/__tests__/dev/adr.test.ts`: mocks `createEntity`; tests slug generation from various titles (special chars, unicode, long titles); tests `decision-status: proposed` in template; at least 4 assertions
- [ ] `src/commands/__tests__/dev/dependency-map.test.ts`: mocks `getRelations`; tests `depends-on` filter (excludes `related-to` edges); tests `--format dot` output contains `digraph`; at least 3 assertions
- [ ] `src/commands/__tests__/dev/code-link.test.ts`: mocks `obEval`; tests CODEPATH validation (rejects `]]`, rejects newlines, accepts valid paths); tests idempotency logic; at least 4 assertions
- [ ] `src/commands/__tests__/study/coverage.test.ts`: tests coverage metric calculation with mock note data; at least 2 assertions
- [ ] `tests/integration/domain/adr.integration.test.ts`: ports assertions from `cli/core/tests/test-adr.sh`; verifies ADR note created with correct frontmatter and parent wiring; requires `OBSIDIAN_RUNNING=1`
- [ ] `tests/integration/domain/code-link.integration.test.ts`: ports assertions from `cli/core/tests/test-code-link.sh`; verifies idempotent append; requires `OBSIDIAN_RUNNING=1`
- [ ] `tests/integration/domain/dependency-map.integration.test.ts`: ports assertions from `cli/core/tests/test-dependency-map.sh`; requires `OBSIDIAN_RUNNING=1`
- [ ] `bun test src/commands/__tests__/dev/ src/commands/__tests__/study/` exits 0 without Obsidian

## Additional information

The domain skills are thin wrappers around motor and reflex APIs.
The main migration advantage is eliminating subprocess overhead — `adr.sh` previously spawned `bash create-entity.sh` as a child process; the TypeScript equivalent calls `createEntity()` as a function returning `Promise<CommandResult>`.
`dependency-map.ts` similarly calls `getRelations()` and filters in-memory.

> [!important]
> `adr.ts` must call `createEntity()` — not reimplement entity creation.
> This ensures ADRs comply with all entity creation rules (frontmatter, parent wiring, daily note logging, rollback log) established in STORY-033.
> Any ADR-specific fields (`decision-date`, `decision-status`) are passed as extra frontmatter properties.

## System design

- [PLAN.md — Story 037](../PLAN.md)
- [cli/dev/adr.sh — Bash source](../../cli/dev/adr.sh)
- [cli/dev/dependency-map.sh — Bash source](../../cli/dev/dependency-map.sh)
- [cli/dev/code-link.sh — Bash source](../../cli/dev/code-link.sh)
- [cli/study/coverage.sh — Bash source](../../cli/study/coverage.sh)
- [cli/study/progress.sh — Bash source](../../cli/study/progress.sh)
- [cli/study/quiz.sh — Bash source](../../cli/study/quiz.sh)
- [cli/core/tests/test-adr.sh — integration test source](../../cli/core/tests/test-adr.sh)

## Resources

- [bun:test mock.module for dependency mocking](https://bun.sh/docs/test/mocks#mock-module): `mock.module("../create-entity", () => ({ createEntity: mock(async () => ({ ok: true })) }))` for testing `adr.ts` without invoking the real create-entity stack
- [GraphViz DOT format](https://graphviz.org/doc/info/lang.html): `digraph { "A" -> "B" [label="depends-on"] }` for the `--format dot` output; test by checking output starts with `digraph` and contains `->` edge syntax
- [ADR slug generation](https://adr.github.io/): `title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")` produces a clean URL-safe slug; prepend `adr-${date}-`

## Recommendations

- The `### Context`, `### Decision`, `### Consequences` subsections in the ADR template should include italic prompt hints: `*What is the problem being solved?*` — these guide the developer and are visible in Obsidian reading view
- `dependency-map.ts` DOT output should be testable without GraphViz installed — assert the string format, not the rendered graph
- `quiz.ts` question generation should be deterministic given a seed — pass `Math.seedrandom` or a fixed subset index to enable reproducible test outputs

## Security considerations

| Area                | Risk                                                                | Mitigation                                                                                                    |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Code path injection | `code-link.ts` writes `CODEPATH` verbatim into a note               | Validate `CODEPATH` excludes `]]` (wikilink break) and `\n` (section break); reject and exit 1 on violation   |
| ADR slug injection  | Malicious title generates a slug that escapes the project directory | Validate generated slug against `/^[a-z0-9-]+$/` after transformation; reject titles that produce empty slugs |

---

> **Blocks**:
>
> - STORY-038 ⛔ — Build, install, remove Bash (all domain commands must be ported first)
