---
title: 'Implement add-connection.sh motor skill'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 5
epic: 'EPIC-002 — Motor Skills: CRUD Operations'
planKey: 'STORY-007'
phase: 2
sequence: 3
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-003
  - STORY-005
blocks:
  - STORY-011
  - STORY-023
  - STORY-024
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 007 acceptance criteria'
---

## Goal

Author `add-connection.sh` in `~/.ontology-cli/core/` to write a typed connection to a source note's `## Connections` section and auto-derive and write the declared inverse to the target note by parsing the project's `_ontology.[project].md` relationship types table. This skill enforces bidirectional integrity at write time.

## Acceptance Criteria

- [ ] `add-connection.sh study "projects/testproj/TESTPROJ.note-a - Note A.md" "depends-on" "projects/testproj/TESTPROJ.note-b - Note B.md" "test context"` writes `- depends-on :: [[TESTPROJ.note-b - Note B|Note B]] — test context` to Note A's `## Connections` section
- [ ] The declared inverse (`depended-by` per default ontology) is written to Note B's `## Connections` section: `- depended-by :: [[TESTPROJ.note-a - Note A|Note A]] — inverse of: test context`
- [ ] Relationship type is validated against `_ontology.[project].md`; an unknown type emits a stderr warning but exits 0
- [ ] Re-running the same command on an already-connected pair exits 0 with no duplicate line written (idempotent)
- [ ] Alias in the wikilink is derived from the note title by stripping the `PREFIX.slug - ` prefix
- [ ] If the target note's `## Connections` already contains 7 entries, the script emits `"Connection limit (7) reached on <note>"` to stderr and exits 1
- [ ] Symmetric relationships (e.g., `compares-to`) write the same relationship type as the inverse
- [ ] If the forward connection is written but the inverse fails, `rollback_log` records the one-sided connection before exiting 1
- [ ] `tests/test-add-connection.sh` passes in the test harness

## Additional Information

Parse `_ontology.[project].md`'s `## Relationship Types` table with `awk` — extract the forward type and its Inverse column. Write to `## Connections` using `app.vault.process` for atomic read-modify-write. `app.vault.process` ensures no race conditions (Limitation L5 — one agent session per vault at a time).

> [!important]
> Derive the project slug from the source note path (the directory name under `projects/`) to locate the correct `_ontology` file. Do not assume a fixed project slug — the script must be project-agnostic.

## System Design

- [PLAN.md — Story 007](../PLAN.md)
- [obsidian_docs.md — v11 §10 Connections format, default relationship types table](../obsidian_docs.md)

## Resources

- [Obsidian `app.vault.process(file, fn)`](https://docs.obsidian.md/Reference/TypeScript+API/Vault/process): atomic read-modify-write of the entire file content; callback receives current content string and returns new content string; prevents partial writes
- [awk field extraction from pipe-delimited tables](https://www.gnu.org/software/gawk/manual/gawk.html): `awk -F'|' '/^\|/ {print $2, $4}'` extracts forward type (col 2) and inverse (col 4) from a Markdown table; `gsub(/\`/, "", field)` strips backtick wrapping
- [Obsidian wikilink alias syntax](https://help.obsidian.md/Linking+notes+and+files/Internal+links#Link+to+a+file): `[[Note Title|Display Alias]]` — the alias is shown in reading mode while the full title is used for link resolution

## Recommendations

- Cache the parsed `_ontology` relationship table in a shell associative array at script start to avoid re-parsing for both the forward and inverse writes
- The idempotency check should scan the existing `## Connections` content for the exact wikilink before writing — a simple `grep -F "[[target-note"` on the section body is sufficient
- Document the 7-connection limit prominently in the error message: `"Connection limit (7) reached — split or promote the note per v11 §topk"`

## Security Considerations

| Area                 | Risk                                                                            | Mitigation                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell injection      | Note paths and context strings passed to `obsidian eval` JavaScript expressions | Escape single quotes in all string arguments interpolated into JavaScript; use JSON serialization via `python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$arg"` to safely encode args |
| Connection injection | `CONTEXT` string written verbatim into the note body                            | Reject or strip newlines from context to prevent breaking the Connections section structure                                                                                                       |

---

> **Blocks**:
>
> - STORY-011 ⛔ — Implement cli-relations.sh reflex skill (connections to audit)
> - STORY-023 ⛔ — Implement dev-specific skills (adr.sh reuses add-connection.sh for parent wiring)
> - STORY-024 ⛔ — Implement migrate.sh (rename-rel operation rewrites connection lines)
