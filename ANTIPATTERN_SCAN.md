# Anti-Pattern Scan Results — NERV CLI

Scan date: 2026-04-10
Scope: Full codebase (~10K LOC, 65+ source files)

---

## Critical

### 1. Bug: `NoteEntityModel.addChild()` Loses Metadata

**File:** `src/types/entity.ts:140-156`

`addChild()` creates a new model but resets `aliases`, `attachments`, `created`, `modified`, and `tags` to empty values instead of preserving them from `this`:

```typescript
return new NoteEntityModel({
  ...
  aliases: [],        /* should be: this.aliases (was defined in the constructor but not preserved here) */
  attachments: [],    /* should be: this.attachments */
  created: '',        /* should be: this.created */
  modified: '',       /* should be: this.modified */
  tags: [],           /* should be: this.tags */
});
```

**Impact:** Silently discards entity metadata whenever a child is added.

---

## High Severity

### 2. Inconsistent Command Hierarchy

**34 of 37 commands** use plain `Command` object literals. Only 3 extend `BaseCommand`:

- `cli-lint.ts`, `cli-relations.ts`, `sync-ontology.ts`

All others manually duplicate vault resolution, `--vault`/`--json` flag parsing, and error handling that `BaseCommand` centralizes.

**Files:** Every file in `src/commands/` except the 3 listed above.

### 3. N+1 Sequential IPC Calls

8+ commands read files one-by-one in `for...await` loops, each spawning a shell process:

| File                | Lines            | Pattern                                    |
| ------------------- | ---------------- | ------------------------------------------ |
| `cli-lint.ts`       | 256-267          | `for` loop with `readFile()` per entry     |
| `cli-relations.ts`  | 120-123, 138-143 | Two sequential read loops                  |
| `explain-topic.ts`  | 161-186          | Sequential `readFile()` for all notes      |
| `sync-topk.ts`      | 107-138          | Sequential `readFile()` per note           |
| `sync-vocab.ts`     | 124-142          | Sequential processing                      |
| `web-ingest/add.ts` | 62-70            | `listFiles()` loop for idempotency         |
| `weekly-review.ts`  | 73-118           | 6 sub-commands, each calling `listFiles()` |

### 4. Copy-Paste: Entity Templates (~150 lines)

`leaf.ts`, `branch.ts`, `root.ts` contain identical frontmatter YAML blocks (11 fields each) differing only in `type:`. Section headers (`## Breadcrumb`, `## Summary`, `## Content`, `## Connections`, `## Flags`) are duplicated across files.

Similarly, `ontology.ts`, `vocab.ts`, `topk.ts` duplicate vault template headers (9 lines each).

**Files:** `src/templates/leaf.ts:22-35`, `src/templates/branch.ts:9-22`, `src/templates/root.ts:15-28`, `src/templates/ontology.ts:42-50`, `src/templates/vocab.ts:39-47`, `src/templates/topk.ts:46-54`

---

## Medium Severity

### 5. Magic Numbers (20+ instances)

| Value                   | Files                                                        | Meaning                         |
| ----------------------- | ------------------------------------------------------------ | ------------------------------- |
| `7`                     | `add-connection.ts:15`, `cli-lint.ts:186`, `sync-topk.ts:51` | Connection limit                |
| `3`                     | `cli-lint.ts:210`, `sync-topk.ts:64`                         | Flag limit                      |
| `10`                    | `sync-ontology.ts:246,249`, `morning.ts:61`                  | Display/recent limit            |
| `100`                   | `web-ingest/monitor.ts:244`                                  | Max articles                    |
| `3600`                  | `web-ingest/monitor.ts:240`                                  | Default poll interval (seconds) |
| `500`, `3000`           | `explain-topic.ts:68,79`, `get-entity.ts:156`                | Substring truncation limits     |
| `100`                   | `get-knowledge-gap.ts:105`                                   | Word count threshold            |
| `200`                   | `migrate.ts:164`                                             | Row cap in overflow log         |
| `1664525`, `1013904223` | `study/quiz.ts:45`                                           | LCG constants (undocumented)    |

### 6. Copy-Paste: Shared Logic (15+ instances)

| Pattern                                                         | Locations                                                                                 | Lines duplicated |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------- |
| Slug validation regex `/^[a-z][a-z0-9-]*$/`                     | 7 files (`add-connection`, canvas/\*, `get-knowledge-gap`, `migrate`, `sync-topk`)        | 7                |
| `buildWriteExpr()` (canvas Obsidian JS)                         | `canvas/dependencies.ts:195-213`, `canvas/relations.ts:110-128`, `canvas/tree.ts:145-164` | ~60              |
| `extractSection()`                                              | `cli-lint.ts:134`, `context.ts:134`                                                       | ~20              |
| `parseSections()`                                               | `explain-topic.ts:73-82`, `get-entity.ts:149-160`                                         | ~20              |
| Regex escape `replace(/[.*+?^${}()\|[\]\\]/g, '\\$&')`          | `web-ingest/monitor.ts:73,84-85`, `context.ts:122`                                        | 3                |
| Wikilink stripping `.replace(/^\[\[/, '').replace(/\]\]$/, '')` | `cli-orphans.ts:69-73,80-84` (+ `rawLink()` at 114)                                       | 10               |
| Status distribution counting                                    | `study/coverage.ts:30-61`, `study/progress.ts:44-71`                                      | ~30              |

### 7. Primitive Obsession

**File:** `src/types/connection.ts`

- `Connection.rel` is `string` — no validation against ontology relationship types
- `Connection.target` is `string` — not a `Slug` or validated wiki link
- `Connection.context` is `string` — no constraints

**File:** `src/types/entity.ts:12`

- `EntityKind` is `string` — no constrained set, no validation helper (unlike `EntityType` and `EntityStatus` which have proper companion objects)

### 8. Anemic Domain Model: `NoteEntityModel`

**File:** `src/types/entity.ts:105-167`

- Only 3 real methods: `validate()`, `addChild()`, `isRoot()`/`requiresParent()` (delegates)
- No methods for: remove child, update status, update spine, change parent, add/remove tags
- Constructor doesn't preserve all fields (see Critical #1)
- `addChild()` doesn't re-validate after modification
- No factory methods for creating from frontmatter or raw data

### 9. God Objects (>200 lines, mixed concerns)

| File               | Lines | Concerns mixed                                                                                  |
| ------------------ | ----- | ----------------------------------------------------------------------------------------------- |
| `migrate.ts`       | 468   | Spec validation + IIFE builder + CLI adapter                                                    |
| `explain-topic.ts` | 324   | Scoring + entity resolution + section parsing + backlink building + vault fetch + orchestration |
| `context.ts`       | 286   | Term extraction + section parsing + scoring + CLI                                               |
| `get-entity.ts`    | 284   | Resolution + section parsing + Obsidian fetch + API + CLI                                       |

### 10. Brittle Expression Building

**File:** `src/lib/obsidian.ts:303-316`

`rollbackLog()` builds a multi-line JS expression via template string interpolation with embedded variables. Has a FIXME comment acknowledging brittleness. Safer approach: use temp file (as done for large expressions at line 205).

### 11. God Function: `obEval()`

**File:** `src/lib/obsidian.ts:193-254` (62 lines)

Mixes 5 concerns: argument validation, expression size detection with temp file handling, process spawning, cleanup, and output parsing with regex filtering.

---

## Low Severity

### 12. Service Locator

**File:** `src/ports/provider.ts:11-12`

Global mutable singletons with setters. Acceptable for CLI tool; setters enable testing. Not blocking but limits scoped DI.

### 13. Hardcoded Command Registry

**File:** `src/cli.ts:21-45`

Manual `COMMANDS` array. Adding a command requires editing two files. Low severity since command count is manageable.

---

## Fix Plan — Priority Order

### Phase 1: Critical Bug Fix

| #   | Task                                                | Files                             | Anti-pattern    |
| --- | --------------------------------------------------- | --------------------------------- | --------------- |
| 1.1 | Fix `addChild()` to preserve all fields from `this` | `src/types/entity.ts:140-156`     | Bug / Data Loss |
| 1.2 | Add unit test for `addChild()` field preservation   | `tests/unit/types/entity.test.ts` | --              |

### Phase 2: Extract Shared Utilities

| #   | Task                                                                    | New/Modified Files                                                     | Anti-pattern              |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| 2.1 | Create `src/lib/regex.ts` with `escapeRegex()` and `SLUG_PATTERN`       | New file + update 10 consumers                                         | Copy-Paste, Magic Strings |
| 2.2 | Create `src/lib/sections.ts` with `extractSection()`, `parseSections()` | New file + update `cli-lint`, `context`, `explain-topic`, `get-entity` | Copy-Paste                |
| 2.3 | Create `src/lib/wikilink.ts` with `stripWikilink()`                     | New file + update `cli-orphans`                                        | Copy-Paste                |
| 2.4 | Create `src/lib/canvas-codegen.ts` with `buildWriteExpr()`              | New file + update 3 canvas commands                                    | Copy-Paste                |
| 2.5 | Create `src/constants/limits.ts` with all named constants               | New file + update 12+ commands                                         | Magic Numbers             |

### Phase 3: Template Deduplication

| #   | Task                                                                              | Files                   | Anti-pattern |
| --- | --------------------------------------------------------------------------------- | ----------------------- | ------------ |
| 3.1 | Create `renderFrontmatter(data)` shared builder in `src/templates/frontmatter.ts` | New file                | Copy-Paste   |
| 3.2 | Create `renderEntityBody(type)` section registry                                  | New file                | Copy-Paste   |
| 3.3 | Refactor `leaf.ts`, `branch.ts`, `root.ts` to use shared builders                 | 3 files                 | Copy-Paste   |
| 3.4 | Refactor `ontology.ts`, `vocab.ts`, `topk.ts` to use shared header builder        | 3 files                 | Copy-Paste   |
| 3.5 | Update snapshot tests                                                             | `tests/unit/templates/` | --           |

### Phase 4: Type Safety

| #   | Task                                                                  | Files                     | Anti-pattern        |
| --- | --------------------------------------------------------------------- | ------------------------- | ------------------- |
| 4.1 | Create `RelationType` constrained type with inverse/symmetry metadata | `src/types/connection.ts` | Primitive Obsession |
| 4.2 | Create `EntityKind` validation companion (like `EntityTypes`)         | `src/types/entity.ts`     | Primitive Obsession |
| 4.3 | Use `Slug` type for `Connection.target`                               | `src/types/connection.ts` | Primitive Obsession |
| 4.4 | Enrich `NoteEntityModel` with missing domain methods                  | `src/types/entity.ts`     | Anemic Domain Model |

### Phase 5: Split God Objects

| #   | Task                                                                             | Files                                       | Anti-pattern |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------- | ------------ |
| 5.1 | Split `migrate.ts` into `migrate-spec.ts`, `migrate-engine.ts`, `migrate-cli.ts` | `src/commands/migrate.ts` (468 lines)       | God Object   |
| 5.2 | Extract parsers from `explain-topic.ts` to `src/lib/explain-parsers.ts`          | `src/commands/explain-topic.ts` (324 lines) | God Object   |
| 5.3 | Split `obEval()` into validation, prep, parse helpers                            | `src/lib/obsidian.ts:193-254`               | God Function |

### Phase 6: Command Hierarchy Unification

| #   | Task                                                  | Files                   | Anti-pattern                |
| --- | ----------------------------------------------------- | ----------------------- | --------------------------- |
| 6.1 | Migrate remaining 34 commands to extend `BaseCommand` | All `src/commands/*.ts` | Inconsistent Hierarchy      |
| 6.2 | Standardize error handling via `ctx.out.error()`      | All commands            | Inconsistent Error Handling |

### Phase 7: Performance (N+1)

| #   | Task                                                       | Files                                                                                   | Anti-pattern      |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------- |
| 7.1 | Add `readFiles(vault, paths[])` batch method to `VaultOps` | `src/ports/vault-ops.ts`, `src/adapters/obsidian-cli.ts`, `src/ports/mock-vault-ops.ts` | N+1 IPC           |
| 7.2 | Refactor 8 commands to use batch reads                     | `cli-lint`, `cli-relations`, `explain-topic`, `sync-topk`, etc.                         | N+1 IPC           |
| 7.3 | Add `VaultSnapshot` caching decorator                      | New file `src/lib/vault-snapshot.ts`                                                    | No Caching        |
| 7.4 | Integrate snapshot into `weekly-review.ts` orchestration   | `src/commands/weekly-review.ts`                                                         | Redundant Fetches |

### Verification

After each phase:

1. `bun run typecheck` — no type errors
2. `bun test tests/unit/` — all unit tests pass
3. `bun run lint` — no lint violations
4. `bun test` (if Obsidian available) — integration tests pass
