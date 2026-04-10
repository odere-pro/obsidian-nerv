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

| Pattern                   | Where                               | Purpose                       |
| ------------------------- | ----------------------------------- | ----------------------------- |
| **Template Method**       | `BaseCommand` → 40+ commands        | Standardized CLI lifecycle    |
| **Strategy**              | `OutputStrategy` (Text/JSON)        | Swappable output formatting   |
| **Port & Adapter**        | `VaultOps` interface + adapters     | Decouple domain from Obsidian |
| **Interface Segregation** | `FileReadOps`, `FileWriteOps`, etc. | Narrow dependencies           |
| **Dependency Injection**  | `provider.ts` → `getVaultOps()`     | Testability                   |
| **Command**               | CLI dispatcher + dynamic imports    | Extensible command registry   |
| **Result Type**           | `CommandResult<T>`                  | Explicit success/failure      |
| **Rich Domain Model**     | `NoteEntityModel` with invariants   | Business rule enforcement     |
| **Contract Testing**      | `vault-ops-contract.ts`             | Shared adapter validation     |

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

| Path                           | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| `src/cli.ts`                   | Entry point, command dispatcher             |
| `src/commands/`                | 40+ command implementations                 |
| `src/commands/base-command.ts` | Template Method base class                  |
| `src/ports/vault-ops.ts`       | Port interfaces (ISP)                       |
| `src/adapters/`                | Obsidian CLI + Dev adapters                 |
| `src/types/`                   | Domain types, errors, result                |
| `src/templates/`               | 14 note/entity templates                    |
| `src/lib/`                     | Utilities (markdown, shell, clock, etc.)    |
| `tests/unit/`                  | 40 unit test files                          |
| `tests/integration/`           | 15 integration test files                   |
| `docs/`                        | Architecture, CLI guide, Obsidian reference |

### Scale

~10K LOC TypeScript, 65+ source files, 55 test files, zero runtime dependencies.

---

## Bottlenecks

### 1. N+1 IPC Problem (CRITICAL)

Every vault operation = one shell subprocess (`obEval`). Commands that scan the vault loop sequentially:

| Command          | Pattern                              | Cost (1K-file vault) |
| ---------------- | ------------------------------------ | -------------------- |
| `cli-lint`       | `listFiles()` + N x `readFile()`     | ~1,001 shell spawns  |
| `cli-relations`  | `listFiles()` + N x `readFile()`     | ~1,001 shell spawns  |
| `sync-topk`      | `listFiles()` + N x `readFile()`     | ~1,001 shell spawns  |
| `weekly-review`  | Orchestrates 6 commands sequentially | ~6,000+ shell spawns |
| `web-ingest/add` | 3 x `listFiles()` for one URL        | 3 full vault scans   |

At ~50-100ms per `obEval`, a 1K-file lint takes **50-100 seconds** of pure IPC overhead.

**Key files:** `src/adapters/obsidian-cli.ts` (every method = 1 shell exec), `src/commands/cli-lint.ts:246-267`, `src/commands/cli-relations.ts:110-143`

### 2. No Batching in Adapter

`ObsidianCliAdapter` exposes 1-call-per-method. No `readFiles(paths[])` batch method exists. Creating one entity = 3-4 sequential IPC calls (exists check, listFiles, createFile, updateFrontmatter).

### 3. No Caching Across Commands

`weekly-review` calls `listFiles()` **6 separate times** on the same vault, each spawning a shell process and parsing the full JSON response. No shared cache or transaction scope.

### 4. Sequential Async Loops

All file-reading loops use `for...await` with no parallelism:

```
for (const entry of entries) {
  const file = await ops.readFile(vault, entry.path);  /* sequential */
}
```

No `Promise.allSettled()` or concurrency control anywhere.

### 5. `listFiles()` Loads Everything

Single call returns **all markdown files + all frontmatter** as one JSON blob. For a 10K-file vault, this is 10-50MB per invocation. No pagination, filtering, or streaming.

### 6. Fixed 30s Timeout, No Retry

`src/lib/shell.ts` has a hard 30s timeout with no retry/backoff. Large vaults or slow Obsidian instances fail without recovery.

---

## Architectural Debt

### 1. Inconsistent Command Hierarchy

Only 3 of 38 commands extend `BaseCommand`. The rest are plain objects or procedural functions, bypassing the Template Method lifecycle. No unified arg parsing, error handling, or output formatting.

### 2. Service Locator, Not DI

`src/ports/provider.ts` is global mutable state (`let vaultOps = ...`). No scoping, lifecycle management, or async initialization. Tests must remember to call `setVaultOps()`.

### 3. Stringly-Typed Domain

- `Connection.rel` is `string` (not validated against ontology)
- `EntityKind` is `string` (no constrained set)
- `Connection.target` is `string` (not a validated `Slug`)
- Relationship inversions and symmetry are documented in markdown, not encoded in types

### 4. Template Duplication

14 template files with duplicated frontmatter rendering. `leaf.ts`, `branch.ts`, `root.ts` share 13+ identical lines. No shared frontmatter builder.

### 5. Hardcoded Command Registry

`src/cli.ts` maintains a manual `COMMANDS` array. Adding a command requires editing two files. No auto-discovery.

### 6. Mock Drift Risk

`MockVaultOps` implements all 20+ methods, many as no-ops. Contract tests exist but mock behavior can silently diverge (e.g., `listUnresolved()` always returns `[]`, `appendToFile()` doesn't check file existence).

---

## How to Scale — Prioritized Improvements

### Tier 1: Performance (highest impact)

| Change             | What                                                                                           | Impact                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Batch IPC**      | Add `readFiles(vault, paths[])` to `VaultOps` that reads N files in one `obEval` call          | Reduces 1,000 shell spawns to 1                        |
| **Scoped Cache**   | Create `VaultSnapshot` that caches `listFiles()` result within a command/workflow scope        | Eliminates 5+ redundant vault scans in `weekly-review` |
| **Parallel Reads** | Use `Promise.allSettled()` with concurrency limiter (e.g., 10 concurrent) for file loops       | 10-50x speedup on vault scans                          |
| **Filtered List**  | Add `listFiles(vault, { folder?, glob? })` to filter server-side instead of loading everything | Reduces memory from 50MB to <1MB per query             |

### Tier 2: Architecture (consistency & maintainability)

| Change                                  | What                                                                        | Impact                                         |
| --------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| **Migrate all commands to BaseCommand** | Unify 35 loose commands under Template Method                               | Single lifecycle, consistent error handling    |
| **Typed relationships**                 | Encode `RelationType` as discriminated union with inverse/symmetry metadata | Compile-time safety, enables migration tooling |
| **Branded EntityKind**                  | Constrain `EntityKind` to a validated set                                   | Prevents invalid data at creation time         |
| **Lightweight DI container**            | Replace service locator with scoped container supporting async init         | Better testability, clearer dependency graph   |

### Tier 3: Developer Experience

| Change                         | What                                                                    | Impact                                |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------- |
| **Command auto-discovery**     | Glob `src/commands/**/*.ts`, extract metadata from exports              | Adding a command = creating one file  |
| **Shared frontmatter builder** | Extract `renderFrontmatter()` used by all entity templates              | Schema changes in one place           |
| **Spy-friendly MockVaultOps**  | Add call tracking (method name, args, count)                            | Better assertions, catch N+1 in tests |
| **Retry with backoff**         | Wrap `spawnCapture()` with configurable retry (3 attempts, exponential) | Graceful degradation on slow vaults   |

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

**Key performance gains in the scaled design:**

| Metric                      | Current              | Scaled                     | Improvement              |
| --------------------------- | -------------------- | -------------------------- | ------------------------ |
| Shell spawns (1K-file lint) | ~1,001               | ~2 (list + batch read)     | **500x fewer**           |
| `weekly-review` vault scans | 6+                   | 1 (cached)                 | **6x fewer**             |
| Sequential file reads       | Serial (100s)        | Parallel with limit (2-5s) | **20-50x faster**        |
| Memory per list query       | Full vault (10-50MB) | Filtered subset (<1MB)     | **10-50x smaller**       |
| Failure recovery            | Hard crash at 30s    | Retry + circuit breaker    | **Graceful degradation** |
