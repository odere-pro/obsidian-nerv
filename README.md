# NERV CLI

**Type system, linter, and CI for AI-compiled knowledge.**

Your AI agents re-read their own research every session and nobody measures the cost.

[Andrej Karpathy](https://x.com/karpathy/status/2039805659525644595) got it right: stop using RAG, compile knowledge into structured markdown, let the LLM maintain everything. But what happens when 10 agents write to the same knowledge base across 50 domains? Quality degrades superlinearly. An agent renames an entity. Another agent's cross-references break silently. The vault looks clean. The knowledge is corrupted.

We solved this with databases decades ago. We're about to re-learn it with AI-compiled knowledge.

NERV turns an Obsidian vault into a **typed, validated knowledge system** — through Obsidian's native CLI (v1.12+). Every note declares what it is. Relationships are typed and bidirectional. Writes are validated with enforced limits. The knowledge base stays queryable as it grows, instead of collapsing under its own weight.

## Why local-first

- **Security** — proprietary research never touches someone else's cloud
- **Token economy** — agents read pre-synthesized context instead of re-comprehending raw sources every session
- **Vendor lock immunity** — markdown files in folders, works with any LLM, switch tomorrow and nothing breaks
- **Accuracy** — validated typed ontology produces structurally grounded answers, not hallucinated connections

## Quick start

```bash
git clone https://github.com/odere-pro/obsidian-nerv.git && cd obsidian-nerv
bun install && bun run build

nerv add-vault --vault study --path ~/vaults/study
nerv create-project study aws "Amazon Web Services"
nerv create-entity study aws LEAF s3 "S3 Overview" ROOT concept
```

Requires macOS, [Bun](https://bun.sh), and [Obsidian](https://obsidian.md) >= 1.12.4 with CLI enabled.

## Architecture

```
Agent Intent -> NERV CLI -> VaultOps Interface -> Obsidian CLI (IPC) -> Obsidian Runtime
```

![System overview](docs/architecture/system-overview.png)

## Documentation

- [Architecture and adapter pattern](docs/architecture/adapter-pattern.md)
- [CLI command guide](docs/cli-guide)
- [Obsidian platform reference](docs/obsidian-docs)
- [Agent skill definitions](docs/obsidian-skills)
- [Deep dives on Medium](https://medium.com/@odere.pub)

## Status

Early-stage, open-source. Built for knowledge engineers and developers deploying AI agents against shared Obsidian vaults.
