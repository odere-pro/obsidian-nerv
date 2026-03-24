---
title: 'Author CLAUDE.md agent configs and skill registry'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-006 — Agent Layer: Intelligence and Routing'
planKey: 'STORY-020'
phase: 4
sequence: 5
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-016
blocks:
  - STORY-021
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 020 acceptance criteria'
---

## Goal

Create per-vault `CLAUDE.md` files for `study` and `dev-projectA`, and create the shared skill registry at `~/.ontology-cli/agent/skills.md`. The `CLAUDE.md` files are the agent nervous system configuration — they specify persona, active projects, skill invocation rules, and routing logic that Claude Code reads at session start.

## Acceptance Criteria

- [ ] `study/CLAUDE.md` specifies: vault name, active projects list, persona Study Coach, and all 6 rules: (a) invoke `context.sh` before answering any knowledge question; (b) cite the source note path in every vault-grounded answer; (c) invoke `create-entity.sh` exclusively for all note creation; (d) invoke `add-connection.sh` for all connections; (e) invoke `weekly-review.sh --json` for all review requests; (f) offer to save new knowledge after teaching from training data
- [ ] `dev-projectA/CLAUDE.md` specifies the same 6 rules plus: invoke `adr.sh` for architecture decisions, invoke `dependency-map.sh` for system dependency queries
- [ ] `~/.ontology-cli/agent/skills.md` enumerates all skills in groups: Context Retrieval, CRUD, Maintenance, Study, Dev — each entry specifies name, CLI command, input parameters, output format (JSON/text), and the intent trigger that activates it
- [ ] A `## Quick Reference` section in each `CLAUDE.md` lists the 5 most-frequently invoked skill signatures to minimize lookup overhead per agent turn
- [ ] Opening either vault in Claude Code and asking "what vault am I in?" causes Claude to reference the CLAUDE.md vault name
- [ ] Asking a knowledge question causes Claude to invoke `context.sh` — verifiable from tool call logs

## Additional Information

Rules in `CLAUDE.md` must use imperative language and explicit conditions. The skill registry is a reference document — Claude reads it as part of session context to know what skills are available. Place the `context.sh` rule first so it is evaluated before creation or connection rules on every turn.

> [!important]
> Rule ordering in `CLAUDE.md` is execution priority order. The `context.sh` rule MUST appear first — before any Writer or Linker rules — so vault retrieval always precedes any write operations on every agent turn.

## System Design

- [PLAN.md — Story 020](../PLAN.md)
- [obsidian_docs.md — v11 Agent Layer, CLAUDE.md template format](../obsidian_docs.md)

## Resources

- [Claude Code CLAUDE.md specification](https://docs.anthropic.com/en/docs/claude-code/memory): `CLAUDE.md` files are read at session start; vault-level files in the vault root apply to that vault; rules written as imperative instructions are followed by the agent
- [Claude Code skill invocation from CLAUDE.md](https://docs.anthropic.com/en/docs/claude-code/slash-commands): rules can specify CLI commands to invoke; the agent will use the Bash tool to run them; output is captured and used in the response
- [Intent trigger phrasing for skill activation](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview): use `when the user asks [condition]` phrasing; avoid ambiguous triggers that could match too broadly or too narrowly

## Recommendations

- Test each CLAUDE.md rule by phrasing a matching user query and verifying the correct skill is invoked from tool call logs — do not assume rules work without live verification
- The skill registry `skills.md` should be co-located with the agent patterns (`patterns.md` from STORY-021) in `~/.ontology-cli/agent/` for easy reference
- The `## Quick Reference` section should contain copy-pasteable command signatures, not prose descriptions — agents scan this section at the start of each turn

---

> **Blocks**:
>
> - STORY-021 ⛔ — Implement agent subagent patterns (CLAUDE.md must exist before routing verification)
