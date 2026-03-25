---
title: 'Migrate reflex and autonomic skills to TypeScript with tests'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 8
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-034'
phase: 7
sequence: 3
parallelTrack: B
size: 'L — ~1 day'
dependsOn:
  - STORY-031
blocks:
  - STORY-036
decisionGate: ~
validationBasis: 'bun test src/commands/__tests__/cli-lint.test.ts and all reflex unit tests pass; bun test tests/integration/reflex/ passes with OBSIDIAN_RUNNING=1'
---

## Goal

Port the six reflex and autonomic skills (`cli-lint.sh`, `cli-orphans.sh`, `cli-relations.sh`, `sync-vocab.sh`, `sync-topk.sh`, `sync-ontology.sh`) from Bash to TypeScript command modules in `src/commands/`.
Extract violation detection and graph analysis logic as pure TypeScript functions to enable comprehensive unit testing without Obsidian.

## Acceptance criteria

### cli-lint

- [ ] `src/commands/cli-lint.ts` exports both `Command` (for CLI dispatcher) and `lintProject(vault: string, folder?: string): Promise<LintResult>` (for programmatic use by `weekly-review`)
- [ ] Detects all 11 violation types: `missing-field`, `root-has-parent`, `missing-parent`, `empty-children`, `spine-in-body`, `legacy-flag-tag`, `legacy-status-tag`, `untyped-connection`, `connection-limit`, `missing-breadcrumb`, `flag-limit`
- [ ] Excludes files matching `tpl-*`, `_vocab*`, `_topk*`, `_ontology*`
- [ ] `--json` flag emits stable schema: `{"vault":"...","folder":"...","issues":[{"note":"...","rule":"...","detail":"..."}],"count":N}`
- [ ] Exit code is always 0 (findings on stdout); exit 1 only on script-level errors
- [ ] The 11 violation rules are implemented as a `ViolationRule[]` array of pure functions: `(note: NoteData) => Violation | null` — each rule independently unit-testable

### cli-orphans

- [ ] `src/commands/cli-orphans.ts` detects three orphan types: `ORPHAN` (no `parent:` field), `BROKEN` (parent wikilink resolves to no file), `MISMATCH` (note lists parent P but P does not list note in `children:`)
- [ ] `--project <slug>` filter restricts scan to one project folder
- [ ] `--json` flag emits stable schema matching the existing Bash output

### cli-relations

- [ ] `src/commands/cli-relations.ts` exports both `Command` and `getRelations(vault: string, project: string): Promise<RelationResult>` (used by `dependency-map` in STORY-037)
- [ ] `--json` emits edge list: `{"project":"...","edges":[{"source":"...","target":"...","rel":"...","context":"..."}]}`
- [ ] JSON schema matches the existing Bash output exactly (Auditor subagent compatibility)

### sync-vocab, sync-topk, sync-ontology

- [ ] `src/commands/sync-vocab.ts` scans all project notes, extracts unique `spine` values, updates `_vocab.<slug>.md` table
- [ ] `src/commands/sync-topk.ts` scans for overflow conditions (> 7 children on any BRANCH), appends to `_topk.<slug>.md`
- [ ] `src/commands/sync-ontology.ts` scans `## Connections` sections, compares rel-types against `_ontology.<slug>.md`, reports missing inverses and unknown types
- [ ] All three sync commands are idempotent and update the `updated:` date in their respective artifact files

### Tests

- [ ] `src/commands/__tests__/cli-lint.test.ts`: tests each of the 11 violation rules as pure functions with mock `NoteData` objects; at least 11 assertions (one per rule); tests exclusion logic for `tpl-*` files; tests `--json` output schema
- [ ] `src/commands/__tests__/cli-orphans.test.ts`: tests ORPHAN, BROKEN, MISMATCH detection with mock vault data; at least 4 assertions
- [ ] `src/commands/__tests__/cli-relations.test.ts`: tests edge extraction from mock connection sections; tests JSON schema; at least 3 assertions
- [ ] `src/commands/__tests__/sync-vocab.test.ts`: tests spine extraction and table generation from mock notes; at least 2 assertions
- [ ] `tests/integration/reflex/cli-lint.integration.test.ts`: ports assertions from `cli/core/tests/test-cli-lint.sh`; requires `OBSIDIAN_RUNNING=1`
- [ ] `tests/integration/reflex/cli-relations.integration.test.ts`: ports assertions from `cli/core/tests/test-cli-relations.sh`; requires `OBSIDIAN_RUNNING=1`
- [ ] `bun test src/commands/__tests__/cli-*.test.ts src/commands/__tests__/sync-*.test.ts` exits 0 without Obsidian

## Additional information

The reflex skills are read-heavy and produce reports — they do not modify vault files (except the sync commands which update artifact files).
The core insight for testability is that violation detection and graph analysis are pure functions of vault data, not of the Obsidian API.
Extract a `NoteData` interface that represents everything a lint rule or orphan check needs, and populate it from a single `obEval` call that reads all project notes at once.

> [!important]
> `cli-relations.ts` JSON schema stability is critical — the Auditor subagent (STORY-021) and `dependency-map.ts` (STORY-037) both consume this output. Any schema change breaks downstream consumers. Lock the schema with a snapshot test.

## System design

- [PLAN.md — Story 034](../PLAN.md)
- [cli/core/cli-lint.sh — Bash source for all 11 rules](../../cli/core/cli-lint.sh)
- [cli/core/cli-orphans.sh — Bash source](../../cli/core/cli-orphans.sh)
- [cli/core/cli-relations.sh — Bash source](../../cli/core/cli-relations.sh)
- [cli/core/sync-vocab.sh — Bash source](../../cli/core/sync-vocab.sh)
- [cli/core/sync-topk.sh — Bash source](../../cli/core/sync-topk.sh)
- [cli/core/sync-ontology.sh — Bash source](../../cli/core/sync-ontology.sh)
- [cli/core/tests/test-cli-lint.sh — integration test source](../../cli/core/tests/test-cli-lint.sh)
- [cli/core/tests/test-cli-relations.sh — integration test source](../../cli/core/tests/test-cli-relations.sh)

## Resources

- [bun:test snapshot testing for schema stability](https://bun.sh/docs/test/snapshots): `expect(output).toMatchSnapshot()` locks the `--json` output schema; any breaking change fails the test and requires explicit snapshot update
- [TypeScript discriminated unions for violation types](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions): `type Violation = { rule: "missing-field"; note: string; detail: string } | { rule: "root-has-parent"; ... }` enables exhaustive switch coverage
- [Obsidian `metadataCache.resolvedLinks`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache): use for orphan detection — `resolvedLinks[sourcePath]` returns all outgoing links; compare against `parent:` field to detect BROKEN orphan type

## Recommendations

- Define a `NoteData` interface: `{ path: string; frontmatter: Record<string, unknown>; body: string; connections: ConnectionLine[]; backlinks: string[] }` — this is the single input type for all lint rules and orphan checks
- Batch the `obEval` call: read all project notes in a single JavaScript pass (`app.vault.getMarkdownFiles().filter(...)`) and return them as a JSON array — avoid one `obEval` call per note
- The violation rule array pattern (`ViolationRule[]`) enables future extensibility: add a new rule by adding a function to the array, no dispatcher changes needed

---

> **Blocks**:
>
> - STORY-036 ⛔ — Orchestration migration (weekly-review imports cli-lint and sync-\* modules)
