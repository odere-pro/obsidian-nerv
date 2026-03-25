---
title: 'Document direct CLI commands in PATTERNS.md and verify readiness'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-009 — CLI Skill Integration'
planKey: 'STORY-027'
phase: 6
sequence: 1
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-002
  - STORY-008
blocks:
  - STORY-028
decisionGate: ~
validationBasis: 'Verified by running every documented direct CLI command against the E2E test vault and confirming exit 0'
---

## Goal

Expand `PATTERNS.md` with a new `## Simple Operations — Direct CLI Commands` section that documents every Obsidian CLI command suitable for single-step operations.
Establish a clear decision boundary: use direct commands for one-shot reads, writes, and queries — use `obsidian eval` closures for multi-step atomic operations.
Verify that `obsidian read`, `obsidian search`, `obsidian backlinks`, `obsidian tags`, `obsidian unresolved`, and `obsidian files` execute successfully after CLI registration (extending STORY-002 verification scope).

## Acceptance Criteria

- [ ] `PATTERNS.md` contains a new `## Simple Operations — Direct CLI Commands` section after the existing 5 eval patterns
- [ ] Section documents each direct command with: syntax, parameters, example invocation, example output, and when to use vs when to use `eval`
- [ ] Commands documented: `read`, `create`, `append`, `property:set`, `search`, `backlinks`, `tags`, `files`, `unresolved`, `daily:read`, `daily:append`, `tasks`
- [ ] A `### Decision Boundary` subsection defines the rule: "Use a direct command when the operation is a single read, write, or query with no dependent steps. Use `eval` when two or more steps must execute atomically in a single JS closure."
- [ ] An anti-pattern box warns: "Do not chain multiple direct commands to replace a single `eval` closure — sequential shell calls are not atomic and risk partial writes on failure."
- [ ] `obsidian read`, `obsidian search`, `obsidian backlinks`, and `obsidian tags` return exit 0 when executed against the test vault — verified as a post-registration checklist in the companion guide
- [ ] `obsidian unresolved` and `obsidian files sort=modified limit=5` return exit 0 against the test vault

## Additional information

The 5 existing eval patterns in `PATTERNS.md` document multi-step atomic operations.
The new section complements them by covering the simpler direct commands that skill authors should prefer for one-shot operations.
This separation prevents skill authors from over-using `eval` where a one-liner suffices, and prevents under-using `eval` where atomicity is required.

> [!important]
> The decision boundary is the critical deliverable — without it, skill authors have no guidance on when to use direct commands vs eval closures. Every command entry must include a "When to use eval instead" note.

## System design

- [PLAN.md — Story 027](../PLAN.md)
- [PATTERNS.md — existing 5 eval patterns](../../cli/core/PATTERNS.md)
- [obsidian-skill-documentation.md — CLI command reference](../obsidian-skill-documentation.md)

## Resources

- [Obsidian CLI command reference](../obsidian-skill-documentation.md): the skill documentation file authored in the previous phase contains complete syntax for all CLI commands; use it as the source of truth for command signatures
- [kepano/obsidian-skills CLI skill](https://github.com/kepano/obsidian-skills): the upstream skill definition documents command syntax and flags; cross-reference against the local documentation for accuracy
- [Obsidian `obsidian eval` documentation](https://docs.obsidian.md/Reference/TypeScript+API): eval runs arbitrary JavaScript in the Obsidian process; document that eval is the only mechanism for atomic multi-step operations

## Recommendations

- Group commands by operation type: File I/O (`read`, `create`, `append`, `property:set`), Search & Query (`search`, `backlinks`, `tags`, `files`, `unresolved`), Daily Note (`daily:read`, `daily:append`, `tasks`)
- Include a quick-reference table at the top of the section mapping each command to its primary use case in one line
- Add the post-registration CLI verification as a numbered checklist in the companion guide's Prerequisites section so new contributors can validate their setup

---

> **Blocks**:
>
> - STORY-028 ⛔ — Register complete CLI command inventory in skills.md (patterns must be documented first)
