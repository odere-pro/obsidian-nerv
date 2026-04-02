# NERV CLI

A structured knowledge CLI for Obsidian vaults — type system, linter, and CI for AI-compiled knowledge.

## The problem

Your AI agents re-read their own research every session and nobody measures the cost.

[Andrej Karpathy's post](https://x.com/karpathy/status/2039805659525644595) on LLM knowledge bases got it right: stop using RAG, compile knowledge into structured markdown, let the LLM maintain everything.
But the conversation stays in the solo researcher case — one person, one topic, freeform markdown.

What happens when 10 agents write to the same knowledge base across 50 domains?
Quality degrades superlinearly.
An agent renames an entity.
Another agent's cross-references break silently.
The vault looks clean.
The knowledge is corrupted.

We solved this with databases decades ago.
We're about to re-learn it with AI-compiled knowledge.

## What NERV does

NERV turns an Obsidian vault into a **typed, validated knowledge system** where agents can read, write, connect, and audit structured knowledge programmatically — through Obsidian's native CLI (v1.12+).

**Every note declares what it is** — a project anchor (`ROOT`), a sub-domain grouping (`BRANCH`), or an atomic concept (`LEAF`).
Agents stop guessing.
Queries become precise.
You ask for a concept overview and get one, not a random mix of definitions and deep dives.

**Relationships are typed and bidirectional** — not just wikilinks.
"What depends on this system?" becomes answerable.
"What breaks if we change this concept?" becomes a single query.
MapReduce-style analysis across your entire vault becomes possible.

**Writes are validated with enforced limits** — agents can't silently overload a note with 30 connections or create orphans nobody detects.
The knowledge base stays queryable as it grows, instead of collapsing under its own weight.

This is the difference between a pile of markdown files and a knowledge system.

## Why local-first

The entire stack runs on your machine.

- **Security** — proprietary research, domain models, competitive analysis — none of it touches someone else's cloud
- **Token economy** — compiled knowledge means agents read pre-synthesized context instead of re-comprehending raw sources every session
- **Vendor lock immunity** — markdown files in folders, works with any LLM, switch tomorrow and nothing breaks
- **Accuracy** — an LLM reasoning over validated, typed ontology with enforced relationships produces structurally grounded answers, not hallucinated connections

## Architecture

```text
Agent Intent -> NERV CLI -> VaultOps Interface -> Obsidian CLI (IPC) -> Obsidian Runtime
```

A Claude Code agent (configured via `CLAUDE.md`) detects user intent and routes to one of four patterns: **Researcher** (read), **Writer** (create), **Linker** (connect), or **Auditor** (review).
Each pattern invokes NERV commands grouped by category.

Commands never call Obsidian directly.
They call a `VaultOps` interface (12 methods).
In production, `ObsidianCliAdapter` sends JS expressions via `obsidian eval` IPC to the Obsidian Electron runtime.
For tests, `MockVaultOps` provides an in-memory double with contract tests verifying both adapters behave identically.

![System overview](docs/architecture/system-overview.png)

## Ontology

### Entity types

| Type     | Role                       | Parent   | Children |
| -------- | -------------------------- | -------- | -------- |
| `ROOT`   | Top-level project anchor   | None     | Yes      |
| `BRANCH` | Sub-domain grouping node   | Required | Yes      |
| `LEAF`   | Atomic concept or decision | Required | None     |

Every entity has YAML frontmatter with enforced fields: `title`, `type`, `kind`, `spine`, `status`, `parent`, `children`.
Parent-child links are bidirectional.

### Relationships

Connections use typed syntax with registered inverses (e.g. `depends-on` <-> `depended-by`).
`nerv add-connection` writes both forward and inverse links automatically.

```markdown
- depends-on :: [[AWS.iam-basics - IAM Basics]] — requires IAM permissions
```

### Validation

`nerv cli-lint` enforces 11 rules covering structure, connections (max 7 per note), and hygiene.
`nerv sync-topk` enforces capacity limits and logs violations.
`nerv weekly-review` orchestrates the full health pipeline: lint -> orphans -> unknown relations -> missing inverses -> vocabulary sync -> overflow tracking -> unresolved wikilinks.

![Validation model](docs/architecture/validation-model.png)

## Commands

| Category      | Commands                                                           | Purpose                 |
| ------------- | ------------------------------------------------------------------ | ----------------------- |
| Motor         | `create-project`, `create-entity`, `add-connection`, `import-json` | Write structured notes  |
| Sensory       | `context`, `get-entity`, `get-tree`, `get-knowledge-gap`           | Read and query          |
| Reflex        | `cli-lint`, `cli-orphans`, `cli-relations`                         | Validate vault health   |
| Autonomic     | `sync-ontology`, `sync-vocab`, `sync-topk`                         | Keep meta files in sync |
| Orchestration | `morning`, `weekly-review`, `migrate`                              | Composite workflows     |
| Dev           | `dev/adr`, `dev/dependency-map`, `dev/code-link`, `dev/dev-cycle`  | Software development    |
| Study         | `study/quiz`, `study/coverage`, `study/progress`                   | Learning workflows      |
| Canvas        | `canvas/tree`, `canvas/relations`, `canvas/dependencies`           | JSON Canvas 1.0 output  |
| Web Ingest    | `web-ingest/add`, `web-ingest/batch`, `web-ingest/monitor`         | Import web content      |

Run `nerv --help` for the full command list.

## Getting started

### Prerequisites

- macOS
- [Bun](https://bun.sh) runtime
- [Obsidian](https://obsidian.md) with installer >= 1.12.4 and CLI enabled

### Install Obsidian CLI

Download the latest installer from [obsidian.md](https://obsidian.md) and move to `/Applications`.

> [!important]
> The CLI requires installer version **>= 1.12.4**, not just a recent app version. Obsidian auto-updates the app package but not the Electron installer. Check **Settings > General** — if "Installer version" is below 1.12.4, re-download and reinstall.

Enable the CLI: **Settings > General > Command line interface > ON**.
Verify in a new terminal:

```bash
obsidian --version
```

### Install NERV

```bash
git clone https://github.com/odere-pro/obsidian-nerv.git && cd obsidian-nerv
bun install
bun run build          # produces bin/nerv (~61 MB self-contained binary)
```

Add `bin/` to your PATH or symlink `bin/nerv` to a directory already in your PATH.

### First vault

```bash
nerv add-vault --vault study --path ~/vaults/study
nerv current-vault
nerv create-project study aws "Amazon Web Services"
nerv create-entity study aws LEAF s3 "S3 Overview" ROOT concept
```

### Vault resolution

NERV resolves which vault to operate on using this priority: `--vault` flag -> `NERV_DEFAULT_VAULT` env var -> default vault in `.nerv/vaults.json`.

## Testing

```bash
bun run test:unit          # MockVaultOps, no Obsidian required
bun run test:integration   # requires running Obsidian instance
bun test                   # all tests
```

Integration tests need a `.env.integration` file — copy from the example and run from the repo root:

```bash
cp .env.integration.example .env.integration
bun run test:integration
```

Set `NERV_SKIP_CLEANUP=1` to keep the vault open for inspection after tests.

## Contributing

ESLint + Prettier enforced via lint-staged (husky pre-commit hook).
Run `bun run validate` for the full pipeline: lint, format, typecheck.

To add a new command: create `src/commands/<name>.ts`, register in `src/cli.ts`, use `getVaultOps()` for all vault I/O, and write unit tests with `MockVaultOps`.
See [`docs/architecture/adapter-pattern.md`](docs/architecture/adapter-pattern.md) for the full guide.

> [!warning]
> Every string argument embedded in an `obEval()` expression **must** pass through `encodeForJs()`. Never interpolate user-supplied values directly.

## Further reading

- [`docs/architecture/adapter-pattern.md`](docs/architecture/adapter-pattern.md) — VaultOps interface reference and contract tests
- [`docs/cli-guide/`](docs/cli-guide) — command documentation by skill category
- [`docs/obsidian-docs/`](docs/obsidian-docs) — Obsidian platform reference
- [`docs/obsidian-skills/`](docs/obsidian-skills) — agent skill definitions
- [Architecture deep dive on Medium](https://medium.com/@odere.pub) — ontology design and token economics

## Status

Early-stage, open-source.
Built for knowledge engineers and developers deploying AI agents against shared Obsidian vaults.

[github.com/odere-pro/obsidian-nerv](https://github.com/odere-pro/obsidian-nerv)
