---
title: 'Migrate sensory skills to TypeScript with unit and integration tests'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 13
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-035'
phase: 7
sequence: 4
parallelTrack: A
size: 'XL — ~2 days'
dependsOn:
  - STORY-033
blocks:
  - STORY-036
decisionGate: ~
validationBasis: 'bun test src/commands/__tests__/context.test.ts passes 8+ scoring assertions; bun test src/commands/__tests__/get-entity.test.ts passes all 5 match-level cases; bun test tests/integration/sensory/ passes with OBSIDIAN_RUNNING=1'
---

## Goal

Port the five sensory skills (`context.sh`, `get-entity.sh`, `get-tree.sh`, `get-knowledge-gap.sh`, `explain-topic.sh`) from Bash to TypeScript.
Extract the context scoring algorithm and entity match-resolution algorithm as pure TypeScript functions, enabling comprehensive unit testing with mock vault data — no Obsidian required for the core logic.
`explain-topic` composes `context` and `get-entity` as module imports, not subprocesses.

## Acceptance criteria

### context

- [ ] `src/commands/context.ts` exports both `Command` and `scoreNote(query: string, note: NoteData): number` (pure function, zero side effects)
- [ ] Scoring algorithm matches the Bash implementation exactly: title match +10, alias match +8, kind match +5, spine match +4, tag match +3, body term-frequency +1 per occurrence capped at +5
- [ ] Returns JSON: `{"query":"...","vault":"...","results":[{"path":"...","title":"...","type":"...","kind":"...","spine":"...","status":"...","parent":"...","children":[],"aliases":[],"breadcrumb":"...","summary":"...","content":"...","connections":[{"rel":"...","target":"...","context":"..."}]}]}`
- [ ] Accepts optional `limit` parameter (default 5); respects limit in output
- [ ] Notes scoring 0 are excluded from results
- [ ] Accepts `vault=<name>` keyword argument form

### get-entity

- [ ] `src/commands/get-entity.ts` exports both `Command` and `resolveEntity(query: string, notes: NoteData[]): MatchResult | null` (pure function)
- [ ] 5-level match resolution: (1) exact basename match, (2) alias match, (3) slug match, (4) title substring match, (5) fuzzy match — returns `matchType` field indicating which level matched
- [ ] Returns JSON with: `path`, `matchType`, `frontmatter` (full object), `sections` (parsed `## Heading` content), `backlinks` (with metadata), `outgoing` (resolved link targets)
- [ ] Missing entity returns `{"found": false, "query": "..."}` with exit 0

### get-tree

- [ ] `src/commands/get-tree.ts` returns the hierarchical tree for a project as JSON: `{"project":"...","tree":{"note":"ROOT","children":[{"note":"BRANCH","children":[...]}]}}`
- [ ] Builds tree from `parent`/`children` frontmatter relationships

### get-knowledge-gap

- [ ] `src/commands/get-knowledge-gap.ts` returns JSON: `{"stubs":[...],"noConnections":[...],"drafts":[...],"missingFields":[...],"lowLinkCount":[...],"unresolvedLinks":[...]}`
- [ ] Stubs: body word count < 100 (excluding frontmatter); low link count: ROOT or BRANCH with < 2 outgoing links
- [ ] Unresolved links detected by checking each wikilink against `getFirstLinkpathDest` — null means broken

### explain-topic

- [ ] `src/commands/explain-topic.ts` composes `context.scoreNote` and `get-entity.resolveEntity` as direct function imports — no subprocess call
- [ ] Returns JSON: `{"primary":{<full entity>},"parent":{"title":"...","summary":"..."},"siblings":[...],"connected":[...]}`
- [ ] Siblings: all notes whose `parent` matches the primary note's `parent`
- [ ] When primary is ROOT, `parent` is `null`

### Tests

- [ ] `src/commands/__tests__/context.test.ts`: 8+ test cases covering each scoring dimension — title match yields +10, alias match yields +8, kind match yields +5, spine match yields +4, tag match yields +3, body TF yields +1 per occurrence (capped at +5), combined scoring, zero-score exclusion
- [ ] `src/commands/__tests__/get-entity.test.ts`: tests all 5 match levels with mock `NoteData[]` — exact basename, alias, slug, title substring, fuzzy; tests missing entity returns null; at least 6 assertions
- [ ] `src/commands/__tests__/get-tree.test.ts`: tests tree building from mock parent/children data; at least 2 assertions
- [ ] `src/commands/__tests__/get-knowledge-gap.test.ts`: tests stub detection (< 100 words), low link count (ROOT with < 2 links), missing fields; at least 4 assertions
- [ ] `src/commands/__tests__/explain-topic.test.ts`: mocks `context` and `get-entity` modules; tests sibling resolution and null-parent for ROOT; at least 3 assertions
- [ ] `tests/integration/sensory/context.integration.test.ts`: ports all 8 assertions from `cli/core/tests/test-context.sh` (JSON validity, query field, results structure, ranking, zero-score exclusion, breadcrumb, limit, no-match, vault= form, connections schema)
- [ ] `tests/integration/sensory/get-entity.integration.test.ts`: ports all assertions from `cli/core/tests/test-get-entity.sh` (exact match, matchType, path, frontmatter, sections, backlinks, outgoing)
- [ ] `bun test src/commands/__tests__/context.test.ts` exits 0 without Obsidian (pure function tests)

## Additional information

The sensory skills contain the most complex logic in the codebase.
The key migration advantage is extracting `scoreNote` and `resolveEntity` as pure functions — in Bash, these are embedded inside a single multi-hundred-line `obEval` JavaScript IIFE that is impossible to unit test in isolation.
The JavaScript expression passed to `obEval` now only handles data fetching (read all notes in project); all scoring and matching runs in TypeScript.

> [!important]
> The scoring algorithm must produce identical results to the Bash implementation for the same input data.
> Port the exact weights (title +10, alias +8, kind +5, spine +4, tag +3, body TF +1×5 cap) — do not "improve" or adjust them during migration.
> Any scoring change would cause agent behaviour regressions in production vaults.

## System design

- [PLAN.md — Story 035](../PLAN.md)
- [cli/core/context.sh — Bash source with scoring algorithm](../../cli/core/context.sh)
- [cli/core/get-entity.sh — Bash source with 5-level resolution](../../cli/core/get-entity.sh)
- [cli/core/get-tree.sh — Bash source](../../cli/core/get-tree.sh)
- [cli/core/get-knowledge-gap.sh — Bash source](../../cli/core/get-knowledge-gap.sh)
- [cli/core/explain-topic.sh — Bash source](../../cli/core/explain-topic.sh)
- [cli/core/tests/test-context.sh — integration test source (8 assertions)](../../cli/core/tests/test-context.sh)
- [cli/core/tests/test-get-entity.sh — integration test source](../../cli/core/tests/test-get-entity.sh)

## Resources

- [bun:test parameterized tests](https://bun.sh/docs/test/writing#test-each): `test.each([[query, noteData, expectedScore], ...])("scores %s as %d", ...)` for concise scoring test matrices
- [TypeScript type narrowing for match levels](https://www.typescriptlang.org/docs/handbook/2/narrowing.html): `type MatchType = "exact" | "alias" | "slug" | "title" | "fuzzy"` with discriminated union on `MatchResult`
- [Obsidian `metadataCache.getFirstLinkpathDest`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFirstLinkpathDest): used in the `obEval` JS payload to detect unresolved links — returns `TFile | null`; null means the wikilink is broken

## Recommendations

- Define `NoteData` (if not already in STORY-034) as the shared input type between sensory and reflex skills — put it in `src/types/note-data.ts` and import from both
- For `explain-topic`, truncate sibling and connected summaries to 500 characters to control response size — the Researcher subagent consumes this output and long summaries waste context tokens
- Add a performance benchmark in the integration test: `context` should return results in < 3 seconds for a 100-note vault — log timing and fail if > 5 seconds

---

> **Blocks**:
>
> - STORY-036 ⛔ — Orchestration migration (weekly-review invokes knowledge-gap check and needs sensory skills available)
