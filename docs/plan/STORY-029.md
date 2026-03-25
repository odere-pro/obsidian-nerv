---
title: 'Integrate native CLI diagnostics into orchestration and migration skills'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 3
epic: 'EPIC-009 — CLI Skill Integration'
planKey: 'STORY-029'
phase: 6
sequence: 3
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-015
  - STORY-019
  - STORY-024
  - STORY-027
blocks: []
decisionGate: ~
validationBasis: 'Verified by running weekly-review.sh, get-knowledge-gap.sh, and migrate.sh against the E2E test vault and confirming new CLI diagnostic steps execute and contribute to output'
---

## Goal

Enrich three existing skills with native Obsidian CLI diagnostic commands that provide built-in vault analysis without custom `eval` logic: add `obsidian tags sort=count counts` to `weekly-review.sh`, add `obsidian unresolved` as a supplementary pre-check in `get-knowledge-gap.sh`, and add `obsidian unresolved` plus `obsidian tags` as post-migration verification steps in `migrate.sh`.

## Acceptance Criteria

- [ ] `weekly-review.sh` runs `obsidian tags sort=count counts` as sub-command #8 (after `sync-topk`, before `obsidian unresolved`); tag distribution summary appended to the daily note review section
- [ ] `weekly-review.sh --json` output includes a `"tags":{"total":N,"top":[{"tag":"...","count":N}]}` field from the new sub-command
- [ ] `get-knowledge-gap.sh` calls `obsidian unresolved` as a supplementary pre-check before the main `eval` pass; unresolved link count is merged into the `"unresolvedLinks"` field of the JSON output
- [ ] When `obsidian unresolved` returns 0 unresolved links, `get-knowledge-gap.sh` skips the per-note `getFirstLinkpathDest` check for that project (performance optimization)
- [ ] `migrate.sh` runs `obsidian unresolved` and `obsidian tags` as post-migration verification steps; exits with a warning (not failure) if new unresolved links are detected after migration
- [ ] `migrate.sh --dry-run` skips the post-migration verification steps (no vault state to verify)
- [ ] All three skills fall back gracefully if a direct CLI command fails (exit code != 0): log a warning and continue with the existing `eval`-based approach

## Additional information

These three integrations follow the decision boundary established in STORY-027: direct CLI commands handle the single-step diagnostic query, while the surrounding `eval` closures handle multi-step atomic operations.
The `obsidian unresolved` command is the fastest way to get a vault-wide broken-link count — it avoids iterating all files in JavaScript.
The `obsidian tags sort=count counts` command provides tag distribution that `cli-lint.sh` does not currently surface.

> [!important]
> Fallback behavior is mandatory. Direct CLI commands depend on the Obsidian CLI version — older versions may not support all commands. Each integration must detect command failure and fall back to the existing `eval`-based approach with a logged warning.

## System design

- [PLAN.md — Story 029](../PLAN.md)
- [weekly-review.sh — existing orchestrator](../../cli/core/weekly-review.sh)
- [get-knowledge-gap.sh — existing sensory skill](../../cli/core/get-knowledge-gap.sh)
- [migrate.sh — existing migration skill](../../cli/core/migrate.sh)

## Resources

- [Obsidian CLI `unresolved` command](../obsidian-skill-documentation.md): returns a count and list of unresolved wikilinks across the vault; parse the count from output with `grep -c` or `wc -l` depending on output format
- [Obsidian CLI `tags` command with `sort=count counts` modifiers](../obsidian-skill-documentation.md): returns tag names sorted by usage count with occurrence counts; parse with `awk` or `python3 -c` for the JSON field
- [Bash fallback pattern](https://www.gnu.org/software/bash/manual/bash.html#Conditional-Constructs): `if output=$(obsidian unresolved 2>/dev/null); then ... else log_warn "obsidian unresolved unavailable, falling back to eval"; fi`

## Recommendations

- Run `obsidian unresolved` once at the start of `weekly-review.sh` and cache the result for reuse in the summary — avoid calling the same command twice
- For `get-knowledge-gap.sh`, use the `obsidian unresolved` count as a fast-path skip: if count is 0, omit the per-note wikilink resolution loop entirely — this reduces runtime from O(n×links) to O(1) for healthy vaults
- Document the fallback behavior in `PATTERNS.md` as a recommended pattern for all future CLI integrations: "Always wrap direct CLI commands in a conditional with an `eval` fallback."
