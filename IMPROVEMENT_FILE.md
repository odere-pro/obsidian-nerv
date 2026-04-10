# NERV — Project Analysis & System Design

## What It Is

**NERV** is a **CLI tool** (not an Obsidian plugin) that acts as a **type system, linter, and CI for AI-compiled knowledge**. It turns an Obsidian vault into a structured, validated knowledge graph where AI agents can safely read and write without corrupting data.

**Software type:** Domain-specific CLI tool / Developer tool for knowledge management

---

## System Design

### Architecture Style: Hexagonal (Ports & Adapters)

```
┌──────────────────────────────────────────────────┐
│                    CLI Layer                       │
│  cli.ts → Command Registry → Dynamic Imports      │
├──────────────────────────────────────────────────┤
│              Domain / Commands Layer               │
│  BaseCommand (Template Method)                     │
│  40+ commands: create-entity, cli-lint, sync-*...  │
│  NoteEntityModel (rich domain object)              │
│  Templates: leaf, branch, root, ontology, vocab    │
├──────────────────────────────────────────────────┤
│                   Ports Layer                      │
│  VaultOps = FileReadOps | FileWriteOps |           │
│             FrontmatterOps | DailyOps | LinkOps    │
│  OutputStrategy, Clock, DevOps                     │
├──────────────────────────────────────────────────┤
│               Performance Layer                   │
│  VaultSnapshot (caching decorator for VaultOps)    │
│  readFiles() batch method on FileReadOps           │
├──────────────────────────────────────────────────┤
│                 Adapters Layer                     │
│  ObsidianCliAdapter (production — IPC via shell)   │
│  MockVaultOps (testing — in-memory)                │
│  ObsidianDevAdapter (dev tools)                    │
└──────────────────────────────────────────────────┘
          ↕ IPC via `obsidian` CLI
┌──────────────────────────────────────────────────┐
│              Obsidian Desktop App                  │
│  app.vault.*, app.fileManager.*, app.metadataCache │
└──────────────────────────────────────────────────┘
```

### Domain Model: Knowledge Graph

- **Entities** (`NoteEntity`) — typed nodes: `ROOT`, `BRANCH`, `LEAF` with `kind`, `spine`, `status`
- **Connections** — typed edges with `rel`, `target`, `context`; bidirectional via ontology
- **Projects** — scoped containers with their own ontology, vocab, and topK indices
- **Invariants** enforced by `NoteEntityModel`: ROOT has no parent, BRANCH/LEAF require parent, BRANCH requires children

### Design Patterns

| Pattern                   | Where                                 | Purpose                               |
| ------------------------- | ------------------------------------- | ------------------------------------- |
| **Template Method**       | `BaseCommand` → 40+ commands          | Standardized CLI lifecycle            |
| **Strategy**              | `OutputStrategy` (Text/JSON)          | Swappable output formatting           |
| **Port & Adapter**        | `VaultOps` interface + adapters       | Decouple domain from Obsidian         |
| **Interface Segregation** | `FileReadOps`, `FileWriteOps`, etc.   | Narrow dependencies                   |
| **Dependency Injection**  | `provider.ts` → `getVaultOps()`       | Testability                           |
| **Command**               | CLI dispatcher + dynamic imports      | Extensible command registry           |
| **Result Type**           | `CommandResult<T>`                    | Explicit success/failure              |
| **Rich Domain Model**     | `NoteEntityModel` with invariants     | Business rule enforcement             |
| **Contract Testing**      | `vault-ops-contract.ts`               | Shared adapter validation             |
| **Caching Decorator**     | `VaultSnapshot` wrapping `VaultOps`   | Eliminates redundant IPC in workflows |
| **Value Object**          | `RelationType`, `Slug`, `EntityKinds` | Domain validation at construction     |

### SOLID Compliance

- **S** — Each command = one responsibility; each port = one concern
- **O** — `BaseCommand` open for extension, closed for modification
- **L** — `MockVaultOps` and `ObsidianCliAdapter` are interchangeable
- **I** — `VaultOps` decomposed into 5 sub-interfaces
- **D** — Commands depend on `VaultOps` abstraction, not `ObsidianCliAdapter`

### Toolchain

- **Runtime/Build:** Bun (zero external runtime deps, compiles to standalone binary)
- **Language:** TypeScript 6.x, strict mode, ESNext target
- **Testing:** Bun test (unit + integration + contract + snapshot)
- **Quality:** ESLint + Prettier + Husky pre-commit hooks
- **Integration:** Communicates with Obsidian via shell IPC (`obsidian` CLI)

### Key Directories

| Path                           | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `src/cli.ts`                   | Entry point, command dispatcher                          |
| `src/commands/`                | 40+ command implementations                              |
| `src/commands/base-command.ts` | Template Method base class                               |
| `src/ports/vault-ops.ts`       | Port interfaces (ISP)                                    |
| `src/adapters/`                | Obsidian CLI + Dev adapters                              |
| `src/types/`                   | Domain types, value objects, errors, result              |
| `src/templates/`               | 14 note/entity templates                                 |
| `src/lib/`                     | Utilities (markdown, shell, clock, vault-snapshot, etc.) |
| `tests/unit/`                  | 40+ unit test files                                      |
| `tests/integration/`           | 15 integration test files                                |
| `docs/`                        | Architecture, CLI guide, Obsidian reference              |

### Scale

~10K LOC TypeScript, 65+ source files, 55 test files, zero runtime dependencies.

---

## Bottlenecks

### 1. Sequential Async Loops — PARTIALLY RESOLVED

Batch reads replaced the worst N+1 loops (4 commands), but no `Promise.allSettled()` or concurrency control exists for remaining parallel opportunities. Creating one entity still requires 3-4 sequential IPC calls.

### 2. `listFiles()` Loads Everything — OPEN

Single call returns **all markdown files + all frontmatter** as one JSON blob. For a 10K-file vault, this is 10-50MB per invocation. No pagination, filtering, or streaming.

### 3. Fixed 30s Timeout, No Retry — OPEN

`src/lib/shell.ts` has a hard 30s timeout with no retry/backoff. Large vaults or slow Obsidian instances fail without recovery.

---

## Architectural Debt

### 1. Service Locator, Not DI — OPEN

`src/ports/provider.ts` is global mutable state (`let vaultOps = ...`). No scoping, lifecycle management, or async initialization. Tests must remember to call `setVaultOps()`.

**Mitigation:** Sub-commands now accept an optional `injectedOps` parameter, allowing `weekly-review` to pass a shared `VaultSnapshot`. This provides workflow-scoped DI without a full container.

### 2. Stringly-Typed Domain — PARTIALLY RESOLVED

`Connection.rel` is still `string` at runtime (not `RelationType`) — runtime code doesn't use the value object yet. `Connection.target` is still `string` — not validated as `Slug` at the type level.

### 3. Hardcoded Command Registry — OPEN

`src/cli.ts` maintains a manual `COMMANDS` array. Adding a command requires editing two files. No auto-discovery. Low severity since command count is manageable.

### 4. Mock Drift Risk — OPEN

`MockVaultOps` implements all methods, some as no-ops. Contract tests exist but mock behavior can silently diverge (e.g., `listUnresolved()` always returns `[]`). No spy tracking for call counts or argument capture.

---

## How to Scale — Remaining Pattern-Based Improvements

### Tier 1: Performance (remaining items)

| Change                 | Pattern                     | What                                                                    | Impact                              |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| **Filtered List**      | Repository                  | Add `listFiles(vault, { folder?, glob? })` to filter server-side        | Reduces memory from 50MB to <1MB    |
| **Retry with Backoff** | Circuit Breaker + Decorator | Wrap `spawnCapture()` with configurable retry (3 attempts, exponential) | Graceful degradation on slow vaults |

### Tier 2: Architecture (remaining items)

| Change                        | Pattern                      | What                                                                  | Impact                                       |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| **Runtime RelationType**      | Value Object (DDD)           | Update `Connection.rel` to use `RelationType` value object at runtime | Compile-time safety, catches invalid rels    |
| **Branded Connection.target** | Value Object (DDD)           | Use `Slug` type for `Connection.target`                               | Prevents invalid wiki-link targets           |
| **Lightweight DI container**  | DI replacing Service Locator | Replace service locator with scoped container supporting async init   | Better testability, clearer dependency graph |
| **Command auto-discovery**    | Factory Method + Registry    | Glob `src/commands/**/*.ts`, extract metadata from exports            | Adding a command = creating one file         |

### Tier 3: Developer Experience (not pattern-based)

These are valid improvements but don't map to specific design patterns:

| Change                        | What                                                      | Impact                                |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------- |
| **Spy-friendly MockVaultOps** | Add call tracking (method name, args, count)              | Better assertions, catch N+1 in tests |
| **Parallel async loops**      | Use `Promise.allSettled()` for remaining sequential loops | 10-50x speedup on independent reads   |
| **Standardized error output** | Use `ctx.out.error()` consistently across all commands    | Uniform error formatting              |

---

## Completed Improvements — Summary

| Phase | Commit    | What                                                             | Impact                                    |
| ----- | --------- | ---------------------------------------------------------------- | ----------------------------------------- |
| 1     | `f089b7d` | Fixed `addChild()` data loss bug                                 | Preserves all entity metadata             |
| 2     | `59037f4` | Extracted shared utilities, centralized magic numbers            | 12+ files cleaned, single source of truth |
| 3     | `4b2875c` | Deduplicated template frontmatter                                | Schema changes in one place               |
| 4     | `61fba55` | Type safety: RelationType, EntityKinds, NoteEntityModel          | Validation at construction time           |
| 5     | `0c84c9b` | Split god objects: migrate, explain-topic, obEval                | Testable pure functions extracted         |
| 6     | `d0e401e` | Migrated 28 commands to BaseCommand                              | Unified lifecycle, -174 net lines         |
| 7     | `13e0394` | Batch readFiles, VaultSnapshot, N+1 elimination                  | ~500x fewer IPC calls for vault scans     |
| 8     | `4113fa6` | Antipattern fixes: dedup, magic numbers, silent catches, nesting | 17 files, 169 insertions, 118 deletions   |

---

## Target Architecture — Scaled System Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLI Entry Point                                │
│                                                                             │
│  cli.ts ──► CommandDiscovery (auto-glob) ──► CommandRouter                  │
│             scans src/commands/**/*.ts         dispatches by name            │
│             extracts metadata from exports     validates args via ArgParser  │
│                                                                             │
│  Pattern: Auto-Discovery + Command                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                           DI Container (Scoped)                             │
│                                                                             │
│  DIContainer {                                                              │
│    vaultOps(): VaultOps        ─── lazy singleton per scope                 │
│    snapshot(): VaultSnapshot   ─── cached vault state per workflow          │
│    output(): OutputStrategy    ─── Text or JSON (Strategy)                  │
│    clock(): Clock              ─── System or Fixed (Strategy)               │
│  }                                                                          │
│                                                                             │
│  WorkflowScope extends DIContainer  ← shared across sub-commands            │
│  CommandScope  extends DIContainer  ← isolated per single command           │
│  TestScope     extends DIContainer  ← injects mocks + spies                │
│                                                                             │
│  Pattern: Dependency Injection + Scope Hierarchy                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                        Domain / Commands Layer                              │
│                                                                             │
│  ┌──────────────────────────────────────────────────┐                       │
│  │            BaseCommand (Template Method)          │                       │
│  │                                                   │                       │
│  │  run(args)                                        │                       │
│  │    ├─ ArgParser.parse(args)    ← unified parsing  │                       │
│  │    ├─ validate()                                  │                       │
│  │    ├─ resolveVault()                              │                       │
│  │    ├─ execute(ctx) ◄──────── abstract (override)  │                       │
│  │    └─ ctx.out.emit(result)                        │                       │
│  │                                                   │                       │
│  │  ALL 40+ commands inherit BaseCommand             │                       │
│  └──────────┬───────────────────────────┬────────────┘                       │
│             │                           │                                    │
│  ┌──────────▼──────────┐     ┌──────────▼──────────────┐                    │
│  │   Single Commands   │     │  Workflow Orchestrators  │                    │
│  │                     │     │                          │                    │
│  │  create-entity      │     │  weekly-review           │                    │
│  │  cli-lint           │     │    uses WorkflowScope    │                    │
│  │  cli-relations      │     │    shares VaultSnapshot  │                    │
│  │  sync-topk          │     │    runs sub-commands     │                    │
│  │  get-entity         │     │    with parallel where   │                    │
│  │  add-connection     │     │    independent           │                    │
│  │  ...35+ more        │     │                          │                    │
│  └──────────┬──────────┘     └──────────┬───────────────┘                    │
│             │                           │                                    │
│  Pattern: Template Method + Workflow Orchestration                           │
├─────────────┼───────────────────────────┼───────────────────────────────────┤
│             │     Domain Model Layer    │                                    │
│             │                           │                                    │
│  ┌──────────▼───────────────────────────▼──────────────────┐                │
│  │                                                          │                │
│  │  NoteEntityModel          Connection                     │                │
│  │  ├─ type: EntityType      ├─ rel: RelationType ◄─ DU    │                │
│  │  ├─ kind: EntityKind ◄─B  ├─ target: Slug ◄──── Branded │                │
│  │  ├─ spine: string         └─ context: string             │                │
│  │  ├─ status: EntityStatus                                 │                │
│  │  ├─ parent: Slug | null   RelationType (Discrim. Union)  │                │
│  │  └─ children: Slug[]      ├─ type: 'triggers'            │                │
│  │                           ├─ inverse: 'triggered-by'     │                │
│  │  Invariants enforced:     └─ symmetric: false            │                │
│  │  ROOT → no parent                                        │                │
│  │  BRANCH → parent + children                              │                │
│  │  LEAF → parent required    ◄─B = Branded Type            │                │
│  │                            ◄─DU = Discriminated Union    │                │
│  │                                                          │                │
│  │  Pattern: Rich Domain Model + Branded Types              │                │
│  └──────────┬───────────────────────────────────────────────┘                │
│             │                                                                │
├─────────────┼────────────────────────────────────────────────────────────────┤
│             │       Templates Layer                                          │
│             │                                                                │
│  ┌──────────▼──────────────────────────────────────────────┐                │
│  │  FrontmatterBuilder (shared)                             │                │
│  │    renderFrontmatter(data: FrontmatterData) → string     │                │
│  │                                                          │                │
│  │  EntityBodyRegistry                                      │                │
│  │    SECTIONS['leaf']   = [Breadcrumb, Summary, Content..] │                │
│  │    SECTIONS['branch'] = [Breadcrumb, Summary, Content..] │                │
│  │    SECTIONS['root']   = [Summary, Map, Connections..]    │                │
│  │                                                          │                │
│  │  renderLeaf(params)   = FrontmatterBuilder + body        │                │
│  │  renderBranch(params) = FrontmatterBuilder + body        │                │
│  │  renderRoot(params)   = FrontmatterBuilder + body        │                │
│  │  renderOntology, renderVocab, renderTopK, ...            │                │
│  │                                                          │                │
│  │  Pattern: Template Method + Builder                      │                │
│  └──────────────────────────────────────────────────────────┘                │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                           Ports Layer (Interfaces)                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  FileReadOps    FileWriteOps    FrontmatterOps                  │         │
│  │  ├ fileExists   ├ createFile    ├ updateFrontmatter             │         │
│  │  ├ readFile     ├ appendToFile                                  │         │
│  │  ├ readFiles ◄  ├ replaceContent  DailyOps      LinkOps        │         │
│  │  └ listFiles    └ trashFile       ├ appendDaily  ├ listRecent  │         │
│  │    (with filter ◄)                └ openDaily    └ listUnresv  │         │
│  │                                                                 │         │
│  │  ◄ = NEW batch/filter methods                                   │         │
│  │                                                                 │         │
│  │  VaultOps = FileReadOps & FileWriteOps & FrontmatterOps         │         │
│  │           & DailyOps & LinkOps                                  │         │
│  │                                                                 │         │
│  │  OutputStrategy { success(); error(); table(); }                │         │
│  │  Clock          { now(): Date; isoDate(): string; }             │         │
│  │                                                                 │         │
│  │  Pattern: Interface Segregation + Port                          │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                        Performance Layer (NEW)                               │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐        │
│  │                                                                   │        │
│  │  VaultSnapshot (Caching Decorator)                                │        │
│  │  ├─ wraps VaultOps                                                │        │
│  │  ├─ caches listFiles() result per scope                           │        │
│  │  ├─ invalidates on write operations                               │        │
│  │  └─ shared across commands in WorkflowScope                       │        │
│  │                                                                   │        │
│  │  BatchReader (Concurrency Control)                                │        │
│  │  ├─ readFiles(paths[]) → single obEval with N files               │        │
│  │  ├─ concurrency limiter (max 10 parallel IPC calls)               │        │
│  │  └─ Promise.allSettled() with partial failure recovery             │        │
│  │                                                                   │        │
│  │  RetryShell (Resilience Wrapper)                                  │        │
│  │  ├─ wraps spawnCapture() with exponential backoff                 │        │
│  │  ├─ 3 attempts, configurable timeout per attempt                  │        │
│  │  └─ circuit breaker on repeated failures                          │        │
│  │                                                                   │        │
│  │  Pattern: Decorator + Bulkhead + Circuit Breaker                  │        │
│  └──────────────────────────────────────────────────────────────────┘        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                           Adapters Layer                                     │
│                                                                              │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  ObsidianCliAdapter   │  │  ObsidianDev     │  │  MockVaultOps    │      │
│  │  (production)         │  │  Adapter (dev)   │  │  (testing)       │      │
│  │                       │  │                  │  │                  │      │
│  │  implements VaultOps  │  │  implements      │  │  implements      │      │
│  │  + BatchReadOps ◄     │  │  DevOps          │  │  VaultOps        │      │
│  │                       │  │                  │  │  + SpyTracking ◄ │      │
│  │  readFiles() → single │  │  plugin:reload   │  │                  │      │
│  │  obEval with N files  │  │  dev:errors      │  │  call counts     │      │
│  │                       │  │  dev:console     │  │  arg history     │      │
│  └───────────┬───────────┘  └──────────────────┘  │  contract tests  │      │
│              │                                     └──────────────────┘      │
│              │  Pattern: Adapter + Liskov Substitution                       │
├──────────────┼──────────────────────────────────────────────────────────────┤
│              │              IPC / Shell Layer                                │
│              │                                                               │
│  ┌───────────▼───────────────────────────────────────────────────────┐      │
│  │  RetryShell                                                        │      │
│  │    ├─ obEval(vault, expr)       ── evaluates JS inside Obsidian   │      │
│  │    ├─ obEvalBatch(vault, exprs) ── batched evaluation (NEW)       │      │
│  │    ├─ spawnCapture(cmd, args)   ── shell exec with timeout        │      │
│  │    ├─ retry: 3 attempts, exponential backoff                      │      │
│  │    └─ circuit breaker: fail-fast after 5 consecutive timeouts     │      │
│  └───────────┬───────────────────────────────────────────────────────┘      │
│              │                                                               │
│              ↕  IPC via `obsidian` CLI                                       │
├──────────────┼──────────────────────────────────────────────────────────────┤
│  ┌───────────▼───────────────────────────────────────────────────────┐      │
│  │                     Obsidian Desktop App                           │      │
│  │  app.vault.*  ·  app.fileManager.*  ·  app.metadataCache          │      │
│  └───────────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Pattern Interaction Map

```
                    ┌─────────────────────┐
                    │  Auto-Discovery     │
                    │  (Command Pattern)  │
                    └────────┬────────────┘
                             │ registers
                             ▼
┌───────────┐    ┌───────────────────────┐    ┌──────────────────────┐
│ ArgParser │◄───│    BaseCommand        │───►│  OutputStrategy      │
│ (Builder) │    │  (Template Method)    │    │  (Strategy Pattern)  │
└───────────┘    └───────────┬───────────┘    └──────────────────────┘
                             │ receives via DI
                             ▼
                 ┌───────────────────────┐
                 │    DIContainer        │
                 │  (Dependency Inject.) │
                 │                       │
                 │  WorkflowScope ──────►├──── VaultSnapshot (Decorator)
                 │  CommandScope         │        │
                 │  TestScope            │        │ wraps
                 └───────────┬───────────┘        ▼
                             │            ┌─────────────────┐
                             │            │  BatchReader     │
                             │            │  (Bulkhead)      │
                             │            └────────┬─────────┘
                             │                     │ delegates to
                             ▼                     ▼
                 ┌───────────────────────────────────────┐
                 │          VaultOps (Port)               │
                 │  FileReadOps | FileWriteOps | ...      │
                 │  (Interface Segregation)               │
                 └───────────┬──────────┬────────────────┘
                             │          │
              ┌──────────────▼┐   ┌─────▼────────────┐
              │ ObsidianCli   │   │  MockVaultOps    │
              │ Adapter       │   │  + SpyTracking   │
              │ (Adapter)     │   │  (Test Double)   │
              └───────┬───────┘   └──────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  RetryShell   │
              │  (Circuit     │
              │   Breaker)    │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │  Obsidian App │
              └───────────────┘
```

### Description — How Patterns Interact

**Request flow (top to bottom):**

1. **Auto-Discovery (Command Pattern)** — On startup, `cli.ts` globs `src/commands/**/*.ts` and builds a registry from exported metadata. No manual `COMMANDS` array. Adding a command = creating one file.

2. **BaseCommand (Template Method)** — Every command inherits `BaseCommand`. The `run()` method drives a fixed lifecycle: parse args via **ArgParser (Builder)**, validate, resolve vault, call the abstract `execute()`, and emit results via **OutputStrategy (Strategy)**. Subclasses only override `execute()`.

3. **DIContainer (Dependency Injection)** — `BaseCommand.run()` constructs a scoped container and passes it to `execute()` via `CommandContext`. Three scope levels:
   - **CommandScope** — isolated per single command invocation
   - **WorkflowScope** — shared across sub-commands in orchestrators like `weekly-review`; holds a shared `VaultSnapshot`
   - **TestScope** — injects `MockVaultOps` with spy tracking

4. **VaultSnapshot (Caching Decorator)** — Wraps `VaultOps` and caches `listFiles()` results within a scope. When `weekly-review` calls 6 sub-commands, they all share one cached vault scan instead of 6 redundant ones. Write operations invalidate the cache.

5. **BatchReader (Bulkhead)** — Commands that need N files call `readFiles(paths[])` instead of N individual `readFile()` calls. The batch reader sends one `obEval` expression that reads all files at once, reducing 1,000 shell spawns to 1. A concurrency limiter (max 10 parallel IPC calls) prevents overwhelming Obsidian.

6. **VaultOps (Port + Interface Segregation)** — The port layer defines 5 narrow sub-interfaces. Commands declare which subset they need (e.g., `cli-lint` needs `FileReadOps`, not `FileWriteOps`). New batch methods (`readFiles`, filtered `listFiles`) extend `FileReadOps` without breaking existing consumers.

7. **Rich Domain Model (Branded Types + Discriminated Unions)** — `NoteEntityModel` enforces entity invariants. `RelationType` is a discriminated union with compile-time inverse/symmetry metadata. `EntityKind` and `Slug` are branded types that reject invalid values at construction. `Connection.rel` and `Connection.target` use these types instead of raw strings.

8. **FrontmatterBuilder (Builder + Template Method)** — A single `renderFrontmatter()` function produces the YAML header from typed `FrontmatterData`. Entity templates (`renderLeaf`, `renderBranch`, `renderRoot`) compose the builder with type-specific body sections registered in `EntityBodyRegistry`. Schema changes happen in one place.

9. **ObsidianCliAdapter (Adapter + LSP)** — Production adapter translates `VaultOps` calls to `obEval` expressions. Now supports batch reads. **MockVaultOps** satisfies the same contract with in-memory storage plus spy tracking (call counts, arg history). Both pass the same contract test suite — Liskov Substitution is verified.

10. **RetryShell (Circuit Breaker)** — Wraps `spawnCapture()` with 3-attempt exponential backoff. A circuit breaker trips after 5 consecutive timeouts, failing fast instead of waiting 30s per call when Obsidian is unresponsive. Configurable timeouts per operation type (quick reads vs. heavy batch reads).

### Key Performance Gains (Implemented)

| Metric                      | Before                | After                        | Improvement        |
| --------------------------- | --------------------- | ---------------------------- | ------------------ |
| Shell spawns (1K-file lint) | ~1,001                | ~2 (list + batch read)       | **500x fewer**     |
| `weekly-review` vault scans | 6+                    | 1 (cached via VaultSnapshot) | **6x fewer**       |
| Template duplication        | ~150 lines duplicated | Shared builders              | **Single source**  |
| Command boilerplate         | ~10 lines/command     | 0 (BaseCommand handles)      | **-174 net lines** |

### Key Performance Gains (Target — Not Yet Implemented)

| Metric                | Current              | Target                     | Improvement              |
| --------------------- | -------------------- | -------------------------- | ------------------------ |
| Sequential file reads | Serial (100s)        | Parallel with limit (2-5s) | **20-50x faster**        |
| Memory per list query | Full vault (10-50MB) | Filtered subset (<1MB)     | **10-50x smaller**       |
| Failure recovery      | Hard crash at 30s    | Retry + circuit breaker    | **Graceful degradation** |
