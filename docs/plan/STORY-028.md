---
title: 'Register complete CLI command inventory in agent skills.md'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 2
epic: 'EPIC-009 — CLI Skill Integration'
planKey: 'STORY-028'
phase: 6
sequence: 2
parallelTrack: A
size: 'S — ~2 h'
dependsOn:
  - STORY-020
  - STORY-027
blocks: []
decisionGate: ~
validationBasis: 'Verified by confirming every obsidian CLI command appears in skills.md with correct syntax, and the agent resolves each skill entry when queried'
---

## Goal

Expand the `skills.md` registry authored in STORY-020 to enumerate every Obsidian CLI direct command alongside the existing shell skill entries.
The agent reads `skills.md` at session start to know what capabilities are available — an incomplete registry causes the agent to fall back to `eval` for operations that a direct command handles.

## Acceptance Criteria

- [ ] `skills.md` contains a new `## Obsidian CLI — Direct Commands` group after the existing shell skill groups (Context Retrieval, CRUD, Maintenance, Study, Dev)
- [ ] Group is subdivided into: File I/O (`read`, `create`, `append`, `property:set`), Search & Query (`search`, `backlinks`, `tags`, `files`, `unresolved`), Daily Note (`daily:read`, `daily:append`, `tasks`), Plugin Dev (`plugin:reload`, `dev:errors`, `dev:console`, `dev:screenshot`, `dev:dom`, `dev:css`, `dev:mobile`)
- [ ] Each entry specifies: command name, full CLI syntax with all parameters, output format (text/JSON/clipboard), and an intent trigger phrase the agent matches against user queries
- [ ] A `### When to Use` note at the group header states: "Prefer direct commands for single-step operations. Use shell skills (which call `obsidian eval`) for multi-step atomic operations."
- [ ] Opening either vault in Claude Code and asking "list all available CLI commands" causes the agent to reference the new `## Obsidian CLI — Direct Commands` group
- [ ] The `--copy` modifier is documented on commands that support it (`files`, `search`)
- [ ] The `--json` flag is documented on commands that support it (`search`, `tasks`)

## Additional information

The existing `skills.md` groups cover shell scripts that compose `eval` closures.
The new group covers raw CLI commands that the agent can invoke directly without a wrapper script.
This distinction is critical: shell skills handle complex multi-step logic; direct commands handle simple one-off queries.

> [!important]
> Intent triggers must be specific enough to avoid false matches. Use `when the user asks for [exact condition]` phrasing — not broad triggers like "when the user asks about files" which would match too many queries.

## System design

- [PLAN.md — Story 028](../PLAN.md)
- [skills.md — existing skill registry](../../cli/agent/skills.md)
- [PATTERNS.md — direct CLI command section from STORY-027](../../cli/core/PATTERNS.md)

## Resources

- [obsidian-skill-documentation.md — complete CLI reference](../obsidian-skill-documentation.md): use this as the canonical source for command signatures, parameters, and output formats when populating the registry entries
- [kepano/obsidian-skills CLI skill](https://github.com/kepano/obsidian-skills): the upstream skill definition covers all commands with flags and modifiers; cross-reference to ensure no command is missed
- [Claude Code CLAUDE.md and skill registry interaction](https://docs.anthropic.com/en/docs/claude-code/memory): the agent reads `skills.md` at session start; entries must include the CLI syntax as a copy-pasteable command so the agent can invoke it via the Bash tool without transformation

## Recommendations

- Mirror the command grouping from STORY-027's PATTERNS.md section for consistency — both documents should use the same categories
- Include a one-line summary table at the top of the group for quick scanning: `| Command | Purpose | Output |`
- Test each intent trigger by phrasing a matching query in a Claude Code session and verifying the agent selects the correct command from the registry
