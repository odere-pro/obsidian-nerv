# TypeScript CLI — `nerv`

Production-grade TypeScript port of the Bash skill layer, compiled as a single executable with Bun.
For: developers migrating from Bash skills to typed, testable TypeScript commands.

[← Back to CLI Guide](cli-guide-index.md)

---

## Building and running

```bash
bun install
bun run build              # produces bin/nerv
nerv --version             # prints version from package.json
nerv <command> [args]      # dispatches to src/commands/<command>.ts
```

## Testing

```bash
bun run test:unit          # src/ unit tests — no live Obsidian needed
bun run test:integration   # requires .env.integration (OBSIDIAN_RUNNING=1)
bun test                   # all tests
```

---

## Entry point — `src/cli.ts`

Routes `process.argv[2]` to a dynamically imported command module.
Every command module must export a default value satisfying the `Command` interface:

```typescript
interface Command {
  name: string;
  description: string;
  run(args: string[]): Promise<void>;
}
```

Unrecognised commands print usage and exit 1.
`nerv --version` prints the `version` field from `package.json`.

---

## Core library — `src/lib/`

TypeScript port of `cli/core/lib.sh`.
All functions use `Bun.spawn` (async, non-blocking).

### `obsidian.ts`

| Export                          | Description                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `resolveVault(arg?: string)`    | Parse `vault=<name>` prefix or fall back to active vault via `obsidian vault` |
| `obEval(vault, expr)`           | Run JS in a vault via `obsidian eval vault=X code=Y`; 30 s timeout            |
| `dailyAppend(vault, content)`   | Append content to today's daily note                                          |
| `rollbackLog(vault, op, state)` | Append partial-failure entry to `_inbox/_rollback-log.md`                     |

> [!caution]
> `obEval` accepts pre-built JS expressions only.
> Always wrap user-supplied strings with `encodeForJs()` from `json.ts` before embedding them in the expression to prevent code injection into the Obsidian runtime.

### `shell.ts`

| Export              | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `spawnCapture(cmd)` | Async process spawn via `Bun.spawn`; 30-second hard timeout |

Returns `{ stdout, stderr, exitCode }`.
Throws `ShellTimeoutError` on timeout (process is killed).
First parameter is typed as `[string, ...string[]]` — never accepts a raw shell string.

### `logger.ts`

| Export          | Description                             |
| --------------- | --------------------------------------- |
| `logError(msg)` | Write to stderr, call `process.exit(1)` |
| `logWarn(msg)`  | Write to stderr, do not exit            |

### `json.ts`

| Export               | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `encodeForJs(value)` | `JSON.stringify` for safe embedding in JS template strings |
| `parseJson<T>(raw)`  | Returns parsed value or `null` on failure — never throws   |

`encodeForJs` replaces the `python3 -c "import json,sys; print(json.dumps(sys.argv[1]))"` pattern used throughout the Bash scripts.

---

## Shared types — `src/types/`

### `entity.ts`

```typescript
type EntityType = 'LEAF' | 'BRANCH' | 'ROOT';
type EntityStatus = 'draft' | 'review' | 'published' | 'archived';
type EntityKind = string;

interface NoteEntity {
  title: string;
  type: EntityType;
  kind: EntityKind;
  spine: string;
  status: EntityStatus;
  parent: string | null;
  children: string[];
  aliases: string[];
  attachments: string[];
  created: string; // YYYY-MM-DD
  modified: string; // YYYY-MM-DD
  tags: string[];
}
```

### `project.ts`

```typescript
interface ProjectConfig {
  slug: string;
  title: string;
  vaultName: string;
}

type VaultRef = { name: string; path: string };
```

### `connection.ts`

```typescript
interface Connection {
  rel: string;
  target: string;
  context: string;
}

type ConnectionLine = string; // raw "- rel :: [[target]]" format
```

### `result.ts`

```typescript
interface CommandResult<T> {
  ok: boolean;
  data: T;
  error?: string;
}

type ExitCode = 0 | 1;
```

---

## Note templates — `src/templates/`

Typed render functions extracted from the Bash heredoc templates.
Each function accepts a typed parameter interface and returns a complete Markdown string with YAML frontmatter.

YAML field order matches the Bash output exactly — Obsidian preserves key order.

### Parameter interfaces

All entity templates extend a shared base:

```typescript
interface BaseEntityParams {
  title: string;
  slug: string;
  project: string;
  kind: string;
  spine: string;
  status: 'draft' | 'review' | 'published' | 'archived';
  created: string;
  modified: string;
}
```

`LeafParams` and `BranchParams` add a required `parent` field.
`RootParams` has no parent.

### Render functions

| Function         | Template                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `renderLeaf`     | `type: LEAF` with `## Breadcrumb`, `## Summary`, `## Content`, `## Connections`, `## Flags` |
| `renderBranch`   | `type: BRANCH` (same sections as leaf)                                                      |
| `renderRoot`     | `type: ROOT` with `## Summary`, `## Content`, `## Connections`, `## Flags`                  |
| `renderOntology` | 10-row default relationship type table                                                      |
| `renderVocab`    | Vocabulary tracking scaffold                                                                |
| `renderTopk`     | Overflow log scaffold                                                                       |
| `renderBase`     | Bases YAML filter `file.inFolder("projects/<slug>")`                                        |

All functions and parameter types are re-exported from `src/templates/index.ts`.
