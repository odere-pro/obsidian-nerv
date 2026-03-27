---
title: 'Implement agent subagent patterns and routing logic'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-006 — Agent Layer: Intelligence and Routing'
planKey: 'STORY-021'
phase: 4
sequence: 6
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-015
  - STORY-019
  - STORY-020
blocks:
  - STORY-022
  - STORY-023
  - STORY-025
decisionGate: ~
validationBasis: 'Verified by live Claude Code session routing through PLAN.md §Story 021 acceptance criteria'
---

## Goal

Author the Researcher, Writer, Linker, and Auditor subagent behavioral patterns as documented decision trees in `~/.ontology-cli/agent/patterns.md`, and verify routing through live Claude Code sessions against both vaults. These patterns encode the signal-routing logic of the nervous system: which user intent triggers which skill sequence.

## Acceptance Criteria

- [ ] Researcher pattern verified: knowledge question → `context.sh` invoked → if results non-empty, answer grounded in vault content with note path cited; if results empty, answer from training data + `create-entity.sh` offer
- [ ] Writer pattern verified: "save/create/add" intent → `create-entity.sh` invoked with correct type inference (LEAF for atomic content, BRANCH when content implies sub-topics) → `add-connection.sh` invoked if connections mentioned → daily note log confirmed
- [ ] Linker pattern verified: "connect/link/wire" intent → `add-connection.sh` invoked → inverse written on target → warning emitted if source note is at the 7-connection limit
- [ ] Auditor pattern verified: "review/audit" intent → `weekly-review.sh --json` invoked → findings triaged by severity (broken links > missing inverses > lint > stale drafts) → programmatic fix offered per category; `_inbox/_rollback-log.md` included in triage scope
- [ ] Multi-vault routing verified: ambiguous vault reference causes Claude to query `"Which vault: study or dev-projectA?"` before invoking any CLI skill
- [ ] `## Failure Modes` section documented: when a CLI skill exits non-zero, the agent retries once, then reports the error verbatim to the user — it never silently swallows a failed skill invocation
- [ ] All 5 routing cases documented in `patterns.md` with intent trigger, skill invocation sequence, expected output, and failure mode handling

## Additional Information

Test via live Claude Code sessions; use `--verbose` or tool-call logs to verify skill invocations. CLAUDE.md rule ordering matters — the `context.sh` rule must appear first.

> [!important]
> Verification requires a live Obsidian + Claude Code session (Limitation L1). Each of the 5 routing cases must be tested with real queries — do not consider this story complete based on documentation alone. Tool call logs must show the correct CLI invocation.

## System Design

- [PLAN.md — Story 021](../PLAN.md)
- [obsidian_docs.md — v11 Agent Layer, subagent decision trees, failure modes](../obsidian_docs.md)

## Resources

- [Claude Code tool call logging (`--verbose`)](https://docs.anthropic.com/en/docs/claude-code/overview): run `claude --verbose` to see all tool calls including Bash invocations; use this to verify that the correct skill command is invoked for each routing test case
- [CLAUDE.md rule precedence](https://docs.anthropic.com/en/docs/claude-code/memory): rules are applied in document order; place the most specific and highest-priority rules first; a `context.sh` rule at line 1 fires before any write rules
- [Intent trigger taxonomy for CRUD vs retrieval](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview): Researcher triggers: "what is", "explain", "tell me about", "how does"; Writer triggers: "save", "create", "add", "document"; Linker triggers: "connect", "link", "relate", "wire"; Auditor triggers: "review", "audit", "check", "validate"

## Recommendations

- Document each pattern as a flowchart-style decision tree in `patterns.md` using Markdown nested lists — this format is both human-readable and easy for Claude to follow as in-context instructions
- Include concrete example exchanges in `patterns.md` (user prompt → skill invocations → response shape) to reduce ambiguity in routing decisions
- The failure mode rule (retry once, then report verbatim) must be tested explicitly: run a skill with an intentional bad argument and verify the agent does not silently proceed

---

> **Blocks**:
>
> - STORY-022 ⛔ — Implement study-specific skills (Quizmaster pattern extends patterns.md)
> - STORY-023 ⛔ — Implement dev-specific skills (dev routing added to patterns.md)
> - STORY-025 ⛔ — Build and execute E2E test suite (agent pattern verification is part of E2E)
