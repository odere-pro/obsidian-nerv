---
title: 'Implement weekly-review.sh and morning.sh orchestration skills'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-004 — Autonomic Skills: Sync and Review'
planKey: 'STORY-015'
phase: 3
sequence: 7
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-009
  - STORY-010
  - STORY-011
  - STORY-012
  - STORY-013
  - STORY-014
blocks:
  - STORY-021
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 015 acceptance criteria'
---

## Goal

Author `weekly-review.sh` as a one-command orchestrator that executes `cli-lint`, `cli-orphans`, `cli-relations`, `sync-ontology`, `sync-vocab`, `sync-topk`, and `obsidian unresolved` in sequence, then appends a timestamped summary to the current daily note. Author `morning.sh` as the daily startup script. The Auditor subagent invokes `weekly-review.sh` when the user requests a review.

## Acceptance Criteria

- [ ] `weekly-review.sh study aws` runs all 7 sub-commands in sequence; total runtime < 30 seconds for a 100-note vault
- [ ] Appends a structured summary to today's daily note under `## Ontology Work Log` containing: lint issue count, orphan count, unknown relation types, missing inverses, overflow violations, unresolved links count, and a `Review complete: YYYY-MM-DD HH:MM` timestamp
- [ ] Exits 0 when all sub-commands exit 0; exits 1 with the failing command name on stderr when any sub-command fails
- [ ] `morning.sh` executes: `obsidian daily` (opens daily note), `obsidian daily:append` with inbox backlog count, `obsidian files sort=modified limit=10 --copy`, `obsidian unresolved`
- [ ] `weekly-review.sh --json` emits: `{"lint":{"issues":N},"orphans":{"issues":N},"relations":{"unknown":N},"ontology":{"missingInverses":N},"unresolved":N}`
- [ ] A cron entry `0 8 * * 1-5 ~/.ontology-cli/core/morning.sh` executes `morning.sh` on weekdays at 08:00
- [ ] `tests/test-weekly-review.sh` passes in the test harness

## Additional Information

`weekly-review.sh` captures each sub-command's exit code and stdout/stderr individually; collects all findings before the daily note append to avoid partial writes. The Auditor subagent (STORY-021) invokes `weekly-review.sh --json` and triages findings by severity: broken links > missing inverses > lint violations > stale drafts.

> [!important]
> Collect all sub-command outputs before appending to the daily note — a partial append followed by a failure would leave the daily note in an inconsistent state. Buffer all output then write once.

## System Design

- [PLAN.md — Story 015](../PLAN.md)
- [obsidian_docs.md — v11 §20 Weekly review workflow, triage sequence](../obsidian_docs.md)

## Resources

- [Bash process substitution for output capture](https://www.gnu.org/software/bash/manual/bash.html#Process-Substitution): `output=$(command 2>&1); exit_code=$?` captures both stdout and stderr; store per-command in named variables before the daily note append
- [obsidian CLI `unresolved` command](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI): returns a count and list of unresolved wikilinks across the vault; use `--json` flag if available to parse the count programmatically
- [crontab on macOS](https://ss64.com/mac/crontab.html): `crontab -e` to edit; `crontab -l` to list; the cron entry must use the full path to `morning.sh`; ensure `~/.zprofile` is sourced or PATH is set inline for the obsidian CLI to be found

## Recommendations

- Run `cli-lint` first (fastest check) and `sync-ontology` last (slowest) to give early feedback on basic issues before the more expensive cross-reference analysis
- The `--json` output should be stable and versioned — the Auditor subagent pattern (STORY-021) depends on this schema
- Document the cron entry installation in the companion guide so operators can opt in on first setup

---

> **Blocks**:
>
> - STORY-021 ⛔ — Implement agent subagent patterns (Auditor subagent invokes weekly-review.sh --json)
