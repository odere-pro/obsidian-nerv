---
title: 'Create MockVaultOps test double and contract test suite'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-057'
phase: 9
sequence: 3
parallelTrack: C
size: 'M — ~0.5 day'
dependsOn:
  - STORY-051
blocks:
  - STORY-058
decisionGate: ~
validationBasis: 'bun test src/ports/__tests__/mock-vault-ops.contract.test.ts exits 0 (all contract assertions pass against MockVaultOps); OBSIDIAN_RUNNING=1 bun test src/adapters/__tests__/obsidian-cli.contract.test.ts exits 0; bun run typecheck exits 0'
---

## Goal

Build the test infrastructure that makes the `VaultOps` port replaceable with confidence. Two deliverables:

1. **`MockVaultOps`** — a `Map`-backed in-memory implementation of `VaultOps` for use in command unit tests. Replaces per-test `mockImplementationOnce` chains that match Obsidian JS expression output strings. When commands change which port method they call, mock setup changes trivially (set a pre-existing file in the Map); test assertions stay focused on business logic.

2. **Contract test suite** — a reusable function `runVaultOpsContractTests(factory)` that verifies any `VaultOps` implementation satisfies the behavioural contract: create → exists → read roundtrip, frontmatter update, daily append, trash. Run against both `MockVaultOps` (validates the mock is faithful) and `ObsidianCliAdapter` (validates the real adapter, gated on `OBSIDIAN_RUNNING=1`).

## Acceptance Criteria

### `src/ports/__tests__/mock-vault-ops.ts` (test double — not a test file itself)

- [ ] Exports class `MockVaultOps` implementing `VaultOps`
- [ ] Internal state: `Map<string, { content: string; frontmatter: Record<string, unknown> }>` keyed by `"vault/path"`
- [ ] `fileExists(vault, path)` → returns `true` iff the key exists in the Map
- [ ] `readFile(vault, path)` → returns `{ path, content, frontmatter }` from the Map or throws if absent
- [ ] `createFile(vault, path, content)` → parses YAML frontmatter block from `content` (simple regex: `---\n...\n---`), stores separated; throws if key already exists (simulates Obsidian refusing to overwrite)
- [ ] `updateFrontmatter(vault, path, mutations)` → merges `mutations` into stored frontmatter; throws if path absent
- [ ] `listFiles(vault)` → returns all entries whose key starts with `"${vault}/"` as `VaultFileEntry[]`
- [ ] `appendToDaily(vault, content)` → appends `content` to internal daily note entry (key: `"${vault}/__daily__"`); creates it if absent
- [ ] `openDaily(vault)` → no-op (GUI operation; records call for assertion via `spy`)
- [ ] `listRecentFiles(vault, limit, sort)` → returns up to `limit` keys for the vault, ordered by insertion order (sort parameter ignored in mock)
- [ ] `listUnresolved(vault)` → returns empty array by default; test can override via `MockVaultOps.prototype` or a constructor option
- [ ] `trashFile(vault, path)` → deletes the key from the Map; no-op if absent
- [ ] `appendToFile(vault, path, content)` → appends `content` to stored `content`; throws if path absent
- [ ] `replaceFileContent(vault, path, content)` → replaces stored `content`; re-parses frontmatter; throws if path absent
- [ ] Exports helper `seedFile(ops: MockVaultOps, vault: string, path: string, content: string, frontmatter?: Record<string, unknown>): void` to pre-populate the Map in test setup without calling `createFile`

### `src/ports/__tests__/vault-ops.contract.ts` (contract test runner)

- [ ] Exports `runVaultOpsContractTests(label: string, factory: () => VaultOps | Promise<VaultOps>): void`
- [ ] Registers a `describe(label, ...)` block containing the following `test()` cases:

  | Test                                       | Assertions                                                                                              |
  | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
  | `create → fileExists → readFile roundtrip` | Create file, exists returns true, readFile returns same content and frontmatter                         |
  | `fileExists returns false for absent path` | No create, fileExists returns false                                                                     |
  | `updateFrontmatter merges mutations`       | Create file with front matter, update one key, readFile frontmatter has updated key and old keys intact |
  | `appendToFile appends content`             | Create, appendToFile, readFile content contains both original and appended text                         |
  | `replaceFileContent replaces content`      | Create, replaceFileContent, readFile content equals new content only                                    |
  | `trashFile removes entry`                  | Create, trashFile, fileExists returns false                                                             |
  | `listFiles returns created files`          | Create two files in same vault, listFiles returns both                                                  |
  | `appendToDaily accumulates entries`        | Two appendToDaily calls, daily note content contains both                                               |

- [ ] Each test generates unique vault names and paths using a counter to avoid cross-test state pollution

### `src/ports/__tests__/mock-vault-ops.contract.test.ts`

- [ ] Calls `runVaultOpsContractTests('MockVaultOps', () => new MockVaultOps())`
- [ ] All contract tests pass → `bun test src/ports/__tests__/mock-vault-ops.contract.test.ts` exits 0
- [ ] This is the automated validation that `MockVaultOps` is a faithful implementation of the contract

### `src/adapters/__tests__/obsidian-cli.contract.test.ts`

- [ ] Skips entire suite when `process.env.OBSIDIAN_RUNNING !== '1'`
- [ ] Calls `runVaultOpsContractTests('ObsidianCliAdapter', () => new ObsidianCliAdapter())`
- [ ] Uses a throwaway vault name from env: `process.env.CONTRACT_TEST_VAULT ?? 'contract-test-vault'`
- [ ] `OBSIDIAN_RUNNING=1 CONTRACT_TEST_VAULT=my-vault bun test src/adapters/__tests__/obsidian-cli.contract.test.ts` exits 0 when Obsidian is running with the specified vault open

### Typecheck

- [ ] `bun run typecheck` exits 0
- [ ] `MockVaultOps` satisfies `VaultOps` — TypeScript structural check

## Additional Information

**Why contract tests matter:** Without them, `MockVaultOps` could diverge from the real adapter over time — a mock that passes tests but doesn't reflect real behaviour. The contract suite runs the same assertions against both implementations, making divergence visible immediately.

**YAML frontmatter parsing in MockVaultOps:** The mock does lightweight parsing (split on `---` delimiter) to separate frontmatter from content. It does not need to be a full YAML parser — `yaml` package already in the project (or a simple regex) is sufficient. The mock is for test correctness, not production accuracy.

**`seedFile` helper rationale:** Tests that verify error paths (e.g., "command exits 1 when note absent") need to pre-populate with state that doesn't go through `createFile`. `seedFile` writes directly to the internal Map, bypassing the "throws if key exists" guard.

---

> **Blocks**:
>
> - STORY-058 ⛔ — Test migration requires MockVaultOps to be ready
