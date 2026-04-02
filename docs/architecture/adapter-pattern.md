# Adapter pattern

## Overview

Commands in this codebase depend on the `VaultOps` interface (`src/ports/vault-ops.ts`), never on `obEval` or any Obsidian CLI primitive directly. `ObsidianCliAdapter` is the production implementation of that interface; it is the only class allowed to call `obEval`. `MockVaultOps` is the test double — a Map-backed in-memory implementation used by all command unit tests. Swapping Obsidian for a different backend (e.g. a local filesystem adapter) requires authoring a new adapter class only; no command code changes.

## Architecture

```text
Commands
   │ import getVaultOps()
   ▼
src/ports/vault-ops.ts  (VaultOps interface — no imports from lib/)
   ▲                            ▲
   │ implements                 │ implements
src/adapters/obsidian-cli.ts    src/ports/mock-vault-ops.ts
(production, uses obEval)       (test double, uses Map)
```

## VaultOps reference

| Method               | Signature                                    | Description                                                |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `fileExists`         | `(vault, path) => Promise<boolean>`          | Return true if the file exists in the vault.               |
| `readFile`           | `(vault, path) => Promise<VaultFile>`        | Read a file and return its content and parsed frontmatter. |
| `createFile`         | `(vault, path, content) => Promise<void>`    | Create a new file; throws if it already exists.            |
| `updateFrontmatter`  | `(vault, path, mutations) => Promise<void>`  | Merge key/value pairs into the file's frontmatter.         |
| `listFiles`          | `(vault) => Promise<VaultFileEntry[]>`       | Return all markdown files with their frontmatter.          |
| `appendToDaily`      | `(vault, content) => Promise<void>`          | Append a content block to today's daily note.              |
| `openDaily`          | `(vault) => Promise<void>`                   | Open today's daily note in the Obsidian UI.                |
| `listRecentFiles`    | `(vault, limit, sort?) => Promise<string[]>` | Return paths of the most recently modified files.          |
| `listUnresolved`     | `(vault) => Promise<string[]>`               | Return wiki-link targets with no corresponding file.       |
| `trashFile`          | `(vault, path) => Promise<void>`             | Move the file to the vault trash.                          |
| `appendToFile`       | `(vault, path, content) => Promise<void>`    | Append content to an existing file.                        |
| `replaceFileContent` | `(vault, path, content) => Promise<void>`    | Overwrite the full content of an existing file.            |

## DevOps reference

| Method              | Signature                            | Description                                               |
| ------------------- | ------------------------------------ | --------------------------------------------------------- |
| `reloadPlugin`      | `(vault, pluginId) => Promise<void>` | Hot-reload a plugin inside the running Obsidian instance. |
| `captureErrors`     | `(vault) => Promise<string>`         | Capture and return JS error messages logged by Obsidian.  |
| `captureConsole`    | `(vault) => Promise<string>`         | Capture and return the current Obsidian console output.   |
| `captureScreenshot` | `(vault) => Promise<string>`         | Capture and return a screenshot of the Obsidian viewport. |

## How to use VaultOps in a command

```typescript
// Before (coupled to Obsidian CLI):
import { obEval } from '../lib/obsidian';
const exists =
  (await obEval(
    vault,
    `app.vault.getAbstractFileByPath(${encodeForJs(path)}) ? 'exists' : 'absent'`
  )) === 'exists';

// After (port call):
import { getVaultOps } from '../ports/provider';
const ops = getVaultOps();
const exists = await ops.fileExists(vault, path);
```

## How to add a new vault operation

1. Add the method signature to `VaultOps` in `src/ports/vault-ops.ts` with a one-line JSDoc describing what it does.
2. Implement it in `ObsidianCliAdapter` in `src/adapters/obsidian-cli.ts` — write the Obsidian JS expression and pass every string argument through `encodeForJs`.
3. Add the in-memory implementation to `MockVaultOps` in `src/ports/mock-vault-ops.ts`.
4. Add one contract test case to `runVaultOpsContractTests` in `src/ports/__tests__/vault-ops-contract.ts`.
5. Verify: `bun test src/ports/__tests__/mock-vault-ops.contract.test.ts` exits 0.

## How to write tests using MockVaultOps

```typescript
import { MockVaultOps } from '../../ports/mock-vault-ops';
import { setVaultOps } from '../../ports/provider';

let ops: MockVaultOps;

beforeEach(() => {
  ops = new MockVaultOps();
  setVaultOps(ops);
  // Seed preconditions:
  ops.seedFile('my-vault', 'notes/hello.md', '# Hello', { status: 'active' });
});

afterEach(() => {
  setVaultOps(null);
});

test('command trashes the file', async () => {
  await myCommand({ vault: 'my-vault', path: 'notes/hello.md' });
  expect(ops.getTrashedPaths()).toContain('notes/hello.md');
});
```

## Contract test gates

Before merging any change to `ObsidianCliAdapter`, the integration contract test must pass:

```bash
bun test src/adapters/__tests__/obsidian-cli.contract.test.ts
```

This test requires a live Obsidian instance. It is not run in CI by default but must be verified locally before merging adapter changes.

## `encodeForJs` requirement

Every string argument embedded in an `obEval` expression **must** pass through `encodeForJs()` — never use string concatenation or template literals to interpolate user-supplied values directly, as this is a code-injection vector.

## Exceptions: `resolveVault` and `rollbackLog`

`resolveVault` (vault registry lookup) and `rollbackLog` (audit primitive) are intentionally **not** part of `VaultOps`. Commands may still import these directly from `src/lib/obsidian.ts`. They are infrastructure concerns that do not represent vault I/O operations and have no meaningful mock equivalent.
