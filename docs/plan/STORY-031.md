---
title: 'Bun CLI foundation — entry point, shared types, core library'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 5
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-031'
phase: 7
sequence: 1
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-002
blocks:
  - STORY-032
  - STORY-033
  - STORY-034
decisionGate: ~
validationBasis: 'bun test src/lib/ passes with zero failures; nerv --version prints the current package version'
---

## Goal

Establish the TypeScript foundation that every subsequent migration story builds on.
Create the Bun CLI entry point (`src/cli.ts`) with a subcommand dispatcher, shared type definitions (`src/types/`), and the core library modules (`src/lib/obsidian.ts`, `src/lib/shell.ts`, `src/lib/logger.ts`, `src/lib/json.ts`) that replace `cli/core/lib.sh`.
Add `bun test`, `bun test:integration`, and `bun build` scripts to `package.json`.

## Acceptance criteria

- [ ] `src/cli.ts` routes `process.argv[2]` to a dynamically imported command module; unrecognised commands print usage and exit 1; `nerv --version` prints the `version` field from `package.json`
- [ ] `src/cli.ts` defines and exports a `Command` interface: `{ name: string; description: string; run(args: string[]): Promise<void> }` that every command module must satisfy
- [ ] `src/types/entity.ts` exports: `EntityType = "LEAF" | "BRANCH" | "ROOT"`, `EntityStatus = "draft" | "review" | "published" | "archived"`, `EntityKind = string`, `NoteEntity` interface with all frontmatter fields (`title`, `type`, `kind`, `spine`, `status`, `parent`, `children`, `aliases`, `attachments`, `created`, `modified`, `tags`)
- [ ] `src/types/project.ts` exports: `ProjectConfig` interface (`slug`, `title`, `vaultName`), `VaultRef = { name: string; path: string }`
- [ ] `src/types/connection.ts` exports: `Connection` interface (`rel`, `target`, `context`), `ConnectionLine = string` (raw `- rel :: [[target]]` format)
- [ ] `src/types/result.ts` exports: generic `CommandResult<T>` (`ok: boolean; data: T; error?: string`), `ExitCode = 0 | 1`
- [ ] `src/lib/obsidian.ts` exports: `resolveVault(arg?: string): Promise<string>` (parses `vault=<name>` prefix or shells to `obsidian vault`), `obEval(vault: string, expr: string): Promise<string>` (calls `obsidian eval vault=X code=Y` via async `Bun.spawn`, strips `=> ` prefix, 30-second timeout), `dailyAppend(vault: string, content: string): Promise<void>`, `rollbackLog(vault: string, operation: string, partialState: string): Promise<void>`
- [ ] `src/lib/shell.ts` exports: `spawnCapture(cmd: [string, ...string[]]): Promise<{ stdout: string; stderr: string; exitCode: number }>` using `Bun.spawn` with 30-second timeout; throws `ShellTimeoutError` on timeout
- [ ] `src/lib/logger.ts` exports: `logError(msg: string): never` (writes to stderr, calls `process.exit(1)`), `logWarn(msg: string): void` (writes to stderr, does not exit)
- [ ] `src/lib/json.ts` exports: `encodeForJs(value: string): string` (`JSON.stringify` for safe embedding in JS template strings — replaces the `python3 -c "import json..."` pattern), `parseJson<T>(raw: string): T | null` (returns `null` on parse failure, never throws)
- [ ] `package.json` scripts updated: `"test": "bun test"`, `"test:unit": "bun test src/"`, `"test:integration": "bun test tests/integration/ --env-file=.env.integration"`, `"build": "bun build --compile src/cli.ts --outfile=bin/nerv"`
- [ ] `src/lib/__tests__/obsidian.test.ts` unit-tests `resolveVault` and `obEval` using `bun:test` `mock()` without a live Obsidian instance; at least 5 passing assertions
- [ ] `src/lib/__tests__/shell.test.ts` unit-tests `spawnCapture` with `echo` commands and timeout behaviour; at least 3 passing assertions
- [ ] `src/lib/__tests__/json.test.ts` unit-tests `encodeForJs` (special characters, unicode, single quotes) and `parseJson` (valid JSON, malformed JSON returns null); at least 4 passing assertions
- [ ] `bun test src/` exits 0 with zero failures on a machine with no Obsidian running

## Additional information

`lib/obsidian.ts` is the TypeScript equivalent of `cli/core/lib.sh`.
The `obEval` function passes `code=<expr>` as a named parameter — matching the existing Bash implementation's `obsidian eval vault="$vault" code="$expr"`.
The `encodeForJs` function in `json.ts` replaces the `python3 -c "import json,sys; print(json.dumps(sys.argv[1]))"` pattern used throughout every Bash script for safely embedding shell variables in JS template strings.

> [!important]
> `obEval` must use `Bun.spawn` (async, non-blocking) — not `Bun.spawnSync`.
> The Obsidian CLI can take up to 5 seconds for complex eval expressions; a synchronous call blocks the event loop and causes test timeouts.
> The `code=<expr>` named parameter form is required by the Obsidian CLI — positional `code` silently fails.

## System design

- [PLAN.md — Story 031](../PLAN.md)
- [cli/core/lib.sh — existing Bash implementation to port](../../cli/core/lib.sh)
- [tsconfig.json — strict TypeScript config already in place](../../tsconfig.json)
- [package.json — existing Bun project scaffold](../../package.json)

## Resources

- [Bun.spawn API](https://bun.sh/docs/api/spawn): `Bun.spawn(["obsidian", "eval", "vault=study", "code=1+1"])` for async process spawning; use `await new Response(proc.stdout).text()` for output capture
- [bun:test mock()](https://bun.sh/docs/test/mocks): `import { mock } from "bun:test"` for unit testing without Obsidian; `mock.module()` for module-level mocking of `shell.ts` in `obsidian.test.ts`
- [Bun CLI build API](https://bun.sh/docs/bundler/executables): `bun build --compile src/cli.ts --outfile=bin/nerv` produces a self-contained single-file executable that runs without a Bun installation

## Recommendations

- Use a `commands/` directory with a naming convention that matches the CLI subcommand (`nerv create-entity` → `commands/create-entity.ts`) so the dispatcher can resolve modules via `await import(`./commands/${name}.ts`)`
- Add a `.env.integration` file to `.gitignore` with a sample `.env.integration.example` containing `OBSIDIAN_RUNNING=1` so integration tests never run accidentally in CI
- Keep `src/index.ts` as a re-export barrel for library consumers; `src/cli.ts` is the entry point for the compiled binary only

## Security considerations

| Area               | Risk                                                         | Mitigation                                                                                                                                    |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| JS injection       | Caller passes unvalidated user input as `expr` to `obEval`   | `@security` JSDoc warning on `obEval`; document that callers must use `encodeForJs()` for any user-supplied string embedded in the expression |
| Process spawn      | `spawnCapture` could be misused to run arbitrary commands    | Type the first parameter as `[string, ...string[]]` — never accept a raw shell string                                                         |
| Timeout exhaustion | An attacker-crafted eval expression could stall indefinitely | 30-second hard timeout with process kill via `proc.kill()`; throw `ShellTimeoutError`                                                         |

---

> **Blocks**:
>
> - STORY-032 ⛔ — Note template extraction (types and lib modules must exist first)
> - STORY-033 ⛔ — Motor skills migration (core library must exist first)
> - STORY-034 ⛔ — Reflex/autonomic skills migration (core library must exist first)
