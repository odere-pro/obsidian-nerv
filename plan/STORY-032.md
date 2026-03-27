---
title: 'Extract note templates as typed TypeScript render functions'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-032'
phase: 7
sequence: 2
parallelTrack: A
size: 'S — ~2 h'
dependsOn:
  - STORY-031
blocks:
  - STORY-033
decisionGate: ~
validationBasis: 'bun test src/templates/ passes with zero failures; every template output matches the Bash heredoc output byte-for-byte'
---

## Goal

Extract the inline Bash heredoc templates from `create-project.sh` and `create-entity.sh` into typed TypeScript render functions in `src/templates/`.
Each template receives a typed parameter interface and returns a complete Markdown string ready for `app.vault.create`.
Unit tests verify that every required YAML frontmatter key is present and no `undefined` or `null` values leak into rendered output.

## Acceptance criteria

- [ ] `src/templates/leaf.ts` exports `renderLeaf(params: LeafParams): string` — output contains YAML frontmatter with: `title`, `type: LEAF`, `kind`, `spine`, `status: draft`, `parent`, `children: []`, `aliases: []`, `attachments: []`, `created`, `modified`, `tags: []`; body contains `## Breadcrumb`, `## Summary`, `## Content`, `## Connections`, `## Flags` sections
- [ ] `src/templates/branch.ts` exports `renderBranch(params: BranchParams): string` — identical to leaf except `type: BRANCH`
- [ ] `src/templates/root.ts` exports `renderRoot(params: RootParams): string` — `type: ROOT`, `parent: ""`, body contains `## Summary`, `## Content`, `## Connections`, `## Flags` sections
- [ ] `src/templates/ontology.ts` exports `renderOntology(params: OntologyParams): string` — Markdown table with 10-row default relationship types (`parent-of`/`child-of`, `depends-on`/`dependency-of`, `related-to`/`related-to`, `triggers`/`triggered-by`, `implements`/`implemented-by`), YAML frontmatter with `updated:` date
- [ ] `src/templates/vocab.ts` exports `renderVocab(params: VocabParams): string` — vocabulary tracking table scaffold with YAML frontmatter
- [ ] `src/templates/topk.ts` exports `renderTopk(params: TopkParams): string` — overflow log scaffold with YAML frontmatter
- [ ] `src/templates/base.ts` exports `renderBase(params: BaseParams): string` — Bases YAML filter `file.inFolder("projects/<slug>")` with default columns
- [ ] Each render function has a corresponding typed parameter interface (e.g., `LeafParams`, `RootParams`) exported from the same module; all required fields are non-optional
- [ ] `src/templates/index.ts` barrel re-exports all render functions and parameter interfaces
- [ ] `src/templates/__tests__/templates.test.ts` runs at least 12 assertions: one per template verifying all required YAML keys are present, one per template verifying no `undefined`/`null` appears in the output string, and at least one verifying that the `created` and `modified` dates use `YYYY-MM-DD` format
- [ ] Template output matches the Bash heredoc output field-for-field (same key order, same default values) when given identical inputs — verified by snapshot comparison in tests
- [ ] `bun test src/templates/` exits 0 with zero failures

## Additional information

The Bash scripts currently inline templates as heredocs embedded in `ob_eval` JavaScript strings.
Extracting them into typed functions enables compile-time validation of all required parameters, eliminates string interpolation errors, and makes templates directly testable without Obsidian.
The 10-row ontology default table must match the relationship types used by `add-connection.sh` inverse-lookup logic.

> [!important]
> Field order in YAML frontmatter must match the existing Bash output exactly — Obsidian preserves YAML field order, and any reordering would create noisy diffs in existing vault notes when templates are used alongside previously-created notes.

## System design

- [PLAN.md — Story 032](../PLAN.md)
- [cli/core/create-project.sh — heredoc source for root, ontology, vocab, topk, base templates](../../cli/core/create-project.sh)
- [cli/core/create-entity.sh — heredoc source for leaf, branch, root entity templates](../../cli/core/create-entity.sh)
- [src/types/entity.ts — EntityType, EntityStatus (from STORY-031)](../../src/types/entity.ts)

## Resources

- [bun:test snapshot testing](https://bun.sh/docs/test/snapshots): `expect(renderLeaf(params)).toMatchSnapshot()` for byte-level comparison against saved baselines; use `bun test --update-snapshots` to regenerate after intentional changes
- [TypeScript template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html): consider `type YamlDate = `${number}-${number}-${number}``for compile-time date format validation on`created`/`modified` fields
- [Obsidian frontmatter YAML spec](https://help.obsidian.md/Editing+and+formatting/Properties): YAML frontmatter delimiter is `---`; array fields use `[]` inline or indented `- item` syntax; string values with special characters (`::`, `[[`) must be quoted

## Recommendations

- Define a shared `BaseEntityParams` interface with common fields (`title`, `slug`, `project`, `kind`, `spine`, `status`, `created`, `modified`) and extend it for `LeafParams` (adds `parent`), `BranchParams` (adds `parent`), `RootParams` (no parent)
- Use template literal strings (backtick) for the render body — this preserves heredoc readability while enabling TypeScript type checking on interpolated parameters
- Add a `renderDaily(date: string, entries: string[]): string` helper for daily note log entries — this is used by `create-entity`, `add-connection`, and `weekly-review`

---

> **Blocks**:
>
> - STORY-033 ⛔ — Motor skills migration (templates must exist before commands can render notes)
