---
title: 'Document the Ports & Adapters abstraction for contributors'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 2
epic: 'EPIC-012 — Obsidian CLI Weak Dependency Layer'
planKey: 'STORY-059'
phase: 9
sequence: 7
parallelTrack: A
size: 'S — ~0.25 day'
dependsOn:
  - STORY-053
  - STORY-054
  - STORY-055
  - STORY-056
  - STORY-057
  - STORY-058
blocks: []
decisionGate: ~
validationBasis: 'docs/adapter-pattern.md exists and all code examples in it are valid TypeScript (bun run typecheck exits 0 when examples are included as a type-only import); artifacts/obsidian-skills/cli-skill.md contains VaultOps section; artifacts/cli-guide/dev-skills.md contains adapter pattern reference; every public type in src/ports/ and src/adapters/ has a JSDoc comment'
---

## Goal

Document the Ports & Adapters boundary introduced in EPIC-012 so that contributors — human and agent — can extend the system without coupling new code to the Obsidian CLI directly. Four deliverables: a developer guide (`docs/adapter-pattern.md`), JSDoc on all public types, an updated `cli-skill.md` entry, and an updated `dev-skills.md` CLI guide section.

After EPIC-012 the Obsidian CLI is no longer a direct dependency of any command — it is an implementation detail of one adapter class. This story makes that contract visible and explains how to maintain it.

## Acceptance Criteria

### `docs/adapter-pattern.md` (new file)

- [ ] **Overview section** — one paragraph explaining: commands depend on `VaultOps` (interface), not on `obEval` (Obsidian CLI); `ObsidianCliAdapter` is the production implementation; `MockVaultOps` is the test double; swapping Obsidian for a different backend requires authoring a new adapter only

- [ ] **Architecture diagram** (ASCII) showing the dependency direction:

  ```
  Commands
     │ import getVaultOps()
     ▼
  src/ports/vault-ops.ts  (VaultOps interface — no imports from lib/)
     ▲                            ▲
     │ implements                 │ implements
  src/adapters/obsidian-cli.ts    src/ports/__tests__/mock-vault-ops.ts
  (production, uses obEval)       (test double, uses Map)
  ```

- [ ] **VaultOps reference table** — all 12 methods with signature and one-line description, matching the interface in `src/ports/vault-ops.ts`; no implementation detail

- [ ] **DevOps reference table** — all 4 methods with signature and one-line description

- [ ] **How to use VaultOps in a command** — minimal before/after TypeScript snippet:

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

- [ ] **How to add a new vault operation** — numbered steps:
  1. Add the method signature to `VaultOps` in `src/ports/vault-ops.ts`
  2. Implement it in `ObsidianCliAdapter` in `src/adapters/obsidian-cli.ts` (write the Obsidian JS expression; use `encodeForJs` for any string argument)
  3. Add the in-memory implementation to `MockVaultOps` in `src/ports/__tests__/mock-vault-ops.ts`
  4. Add one contract test case to `runVaultOpsContractTests` in `src/ports/__tests__/vault-ops.contract.ts`
  5. Verify: `bun test src/ports/__tests__/mock-vault-ops.contract.test.ts` exits 0

- [ ] **How to write tests using MockVaultOps** — `beforeEach` / `afterEach` pattern with `seedFile`, `setVaultOps`, and state assertion example

- [ ] **Contract test gates** — documents that `OBSIDIAN_RUNNING=1 bun test src/adapters/__tests__/obsidian-cli.contract.test.ts` must pass before merging any `ObsidianCliAdapter` change

- [ ] **`encodeForJs` requirement** — one-sentence rule: every string argument embedded in an `obEval` expression MUST pass through `encodeForJs()`; never use string concatenation or template literals directly

- [ ] **`resolveVault` and `rollbackLog` exceptions** — documents that `resolveVault` (registry lookup) and `rollbackLog` (audit primitive) are intentionally NOT part of `VaultOps` and may still be imported directly from `src/lib/obsidian.ts` in commands

### JSDoc on public types

- [ ] `src/ports/vault-ops.ts` — JSDoc block on `VaultOps` interface: one sentence per method explaining what it does (not how); JSDoc on `VaultFile` and `VaultFileEntry`
- [ ] `src/ports/dev-ops.ts` — JSDoc block on `DevOps` interface: one sentence per method
- [ ] `src/adapters/obsidian-cli.ts` — JSDoc on class: `@implements {VaultOps}`, one-line note that all string arguments use `encodeForJs`
- [ ] `src/ports/__tests__/mock-vault-ops.ts` — JSDoc on class: `@implements {VaultOps}`, note that it is for testing only and must not be imported in production code; JSDoc on `seedFile`

### `artifacts/obsidian-skills/cli-skill.md` update

- [ ] Adds a new `## Adapter layer` section after the existing content with:
  - One paragraph: the CLI skill is implemented via `VaultOps` (port) + `ObsidianCliAdapter` (adapter); agent code never calls `obEval` directly
  - Reference: `docs/adapter-pattern.md` for the full contributor guide

### `artifacts/cli-guide/dev-skills.md` update

- [ ] Adds a `## Adapter pattern` subsection with:
  - When to add a new vault operation (extending the skill surface)
  - The 5-step checklist from `docs/adapter-pattern.md` in condensed form
  - Pointer to `docs/adapter-pattern.md` for full detail

### Typecheck

- [ ] `bun run typecheck` exits 0 — JSDoc additions do not introduce type errors

## Additional Information

**Scope:** This story documents EPIC-012 only. It does not update the Obsidian CLI reference docs (`artifacts/obsidian-docs/cli.md`) — those document the Obsidian CLI binary interface, which is upstream and unchanged.

**Audience split:**

- `docs/adapter-pattern.md` targets TypeScript contributors extending the nerv codebase
- `artifacts/cli-guide/dev-skills.md` update targets operators and agent authors who need to understand what skill operations are available and how they are structured
- `artifacts/obsidian-skills/cli-skill.md` update is read by Claude Code agents as part of session context — keep it brief and action-oriented

**What not to document:** The internal Obsidian JS expressions (`app.vault.create(...)`, `app.metadataCache.getFileCache(...)`) are implementation details of `ObsidianCliAdapter` and should not appear in the developer guide or skill docs. They are visible only within the adapter source file itself.

---

> **Depends on**:
>
> - STORY-053, STORY-054, STORY-055, STORY-056 ⛔ — all command refactors must be complete before documenting the final state
> - STORY-057 ⛔ — MockVaultOps must exist before documenting the test pattern
> - STORY-058 ⛔ — test migration must be complete so the documented pattern matches the actual tests
