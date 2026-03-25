---
title: 'Implement core library (lib.sh)'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 3
epic: 'EPIC-001 — Foundation and Environment'
planKey: 'STORY-003'
phase: 1
sequence: 3
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-002
blocks:
  - STORY-004
  - STORY-005
  - STORY-007
  - STORY-008
  - STORY-009
  - STORY-010
  - STORY-011
  - STORY-012
  - STORY-013
  - STORY-014
  - STORY-016
  - STORY-017
  - STORY-018
  - STORY-024
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 003 acceptance criteria'
---

## Goal

Author `~/.ontology-cli/core/lib.sh` containing shared functions that every CLI skill sources: vault resolution, `obsidian eval` wrapper, daily-note append, error handler, JSON output helper, and a partial-failure rollback logger. This library is the nervous system's spinal cord — it enforces consistent vault targeting, idempotent patterns, JSON-compatible error reporting, and a standard recovery mechanism when multi-step operations fail partway through.

## Acceptance Criteria

- [ ] `lib.sh` exports: `ob_eval(vault, expr)` wrapping `obsidian eval vault="$vault" "$expr"` with proper quoting; `resolve_vault(arg)` returning vault name from `vault=` parameter or defaulting to active vault; `daily_append(vault, content)` wrapping `obsidian daily:append`; `log_error(msg)` writing to stderr and exiting 1; `emit_json(data)` writing JSON to stdout; `rollback_log(vault, operation, partial_state)` appending a structured entry to `_inbox/_rollback-log.md`
- [ ] `source ~/.ontology-cli/core/lib.sh && ob_eval study "app.vault.getName()"` returns `"study"`
- [ ] `resolve_vault "vault=dev-projectA"` returns `dev-projectA`; `resolve_vault ""` returns the active vault name
- [ ] `rollback_log study "create-entity" "Note created at path X but parent children array not updated"` creates or appends to `_inbox/_rollback-log.md` in the study vault
- [ ] All functions are tested with a disposable note and cleaned up; all tests exit 0
- [ ] `lib.sh` contains a version variable `LIB_VERSION="1.0.0"` printed by `lib.sh --version`

## Additional Information

The `ob_eval` wrapper must quote the `expr` argument to prevent shell word-splitting on multi-token JavaScript expressions. The `rollback_log` function writes to `_inbox/` because rollback entries are untriaged items requiring operator attention — the Auditor subagent (STORY-021) includes `_rollback-log.md` in its triage scope.

> [!important]
> Obsidian must be running for any `ob_eval` call (Limitation L1). All downstream skills source this library — any change to function signatures here is a breaking change across all skill stories.

## System Design

- [PLAN.md — Story 003](../PLAN.md)
- [obsidian_docs.md — v11 Obsidian eval API, daily note append](../obsidian_docs.md)

## Resources

- [Bash `source` and function export](https://www.gnu.org/software/bash/manual/bash.html#index-source): functions defined in a sourced file are available in the sourcing shell; use `export -f funcname` only if subshells need them
- [obsidian CLI `daily:append` command](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI): `obsidian daily:append vault="$vault" content="$content"` appends to the current day's daily note; creates the note if it does not yet exist
- [Obsidian CLI `eval` named parameter](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI): the CLI requires `code=<javascript>` as a named parameter — `obsidian eval vault="$vault" code="$expr"`; inner single quotes in the expression must be escaped or the expression built via python3 JSON encoding

## Recommendations

- Keep `lib.sh` to pure functions with no side effects at source time — callers control execution
- Use `printf '%s\n' "$msg" >&2` in `log_error` rather than `echo` to avoid interpreting escape sequences
- The `rollback_log` entry format should be machine-parseable (pipe-delimited or JSON) so the Auditor subagent can programmatically triage partial failures

## Security Considerations

| Area              | Risk                                                                 | Mitigation                                                                                                                             |
| ----------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Command injection | `ob_eval` interpolates `$expr` into a shell command                  | Double-quote `"$expr"` to prevent word splitting; document that callers must not pass user-supplied unvalidated strings as expressions |
| Log injection     | `rollback_log` writes user-supplied `$partial_state` to a vault note | Sanitize newlines from the partial state string before appending to prevent structured log corruption                                  |

---

> **Blocks**:
>
> - STORY-004 ⛔ — Build incremental test harness
> - STORY-005 ⛔ — Implement create-project.sh skill
> - STORY-007 ⛔ — Implement add-connection.sh skill
> - STORY-008 ⛔ — Implement import-json.sh and document CRUD patterns
> - STORY-009 ⛔ — Implement cli-lint.sh reflex skill
> - STORY-010 ⛔ — Implement cli-orphans.sh reflex skill
> - STORY-011 ⛔ — Implement cli-relations.sh reflex skill
> - STORY-012 ⛔ — Implement sync-vocab.sh autonomic skill
> - STORY-013 ⛔ — Implement sync-topk.sh autonomic skill
> - STORY-014 ⛔ — Implement sync-ontology.sh autonomic skill
> - STORY-016 ⛔ — Implement context.sh primary sensory skill
> - STORY-017 ⛔ — Implement get-entity.sh sensory skill
> - STORY-018 ⛔ — Implement get-tree.sh sensory skill
> - STORY-024 ⛔ — Implement migrate.sh schema migration skill
