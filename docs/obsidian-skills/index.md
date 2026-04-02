# Obsidian Skills

_For: developers and AI agents working with Obsidian vaults._

A collection of standardized skill definitions that allow AI agents to programmatically interact with Obsidian vault files. Compatible with Claude Code, Codex CLI, and OpenCode.

**Repository:** [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) · MIT license

---

## Skills

| Skill                          | File type | Primary use                                           |
| ------------------------------ | --------- | ----------------------------------------------------- |
| [Markdown](markdown-skill.md)  | `.md`     | Notes, documents, wikis with Obsidian-specific syntax |
| [Bases](bases-skill.md)        | `.base`   | Database-like views of vault notes                    |
| [JSON Canvas](canvas-skill.md) | `.canvas` | Visual diagrams, mind maps, flowcharts                |
| [Obsidian CLI](cli-skill.md)   | —         | Vault and plugin management via CLI                   |
| [Defuddle](defuddle-skill.md)  | —         | Web-to-Markdown extraction, token optimization        |

---

## Installation

### Marketplace (Claude Code)

```
/plugin marketplace add kepano/obsidian-skills
/plugin install obsidian@obsidian-skills
```

### NPX

```bash
npx skills add git@github.com:kepano/obsidian-skills.git
```

### Manual — Claude Code

Add the repository contents to a `/.claude` folder in the root of your Obsidian vault.

### Manual — Codex CLI

Copy the `skills/` directory into `~/.codex/skills`.

### Manual — OpenCode

Clone the full repo into `~/.opencode/skills/obsidian-skills/`. The full directory structure must be `~/.opencode/skills/obsidian-skills/skills/<skill-name>/SKILL.md`. OpenCode auto-discovers all `SKILL.md` files; no config changes are needed.
