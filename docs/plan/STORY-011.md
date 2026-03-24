---
title: 'Implement cli-relations.sh reflex skill'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-003 — Reflex Skills: Automated Auditing'
planKey: 'STORY-011'
phase: 3
sequence: 3
parallelTrack: C
size: 'M — ~0.5 day'
dependsOn:
  - STORY-003
  - STORY-007
blocks:
  - STORY-014
  - STORY-015
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 011 acceptance criteria'
---

## Goal

Author `cli-relations.sh` in `~/.ontology-cli/core/` to enumerate all typed connections in a project as a source→rel→target edge list, validate each relationship type against the project's `_ontology.[project].md`, and emit a usage summary. This sensory-reflex skill provides the Auditor subagent with the full relationship graph.

## Acceptance Criteria

- [ ] For each note in scope, extracts `- <rel> :: [[<target>]]` lines from `## Connections` and emits: `<source> --<rel>--> <target>`
- [ ] Validates each `<rel>` against `_ontology.[project].md`; emits `⚠ Unknown relationship type: '<rel>'` for unrecognized types without halting
- [ ] Emits a summary block: count per relationship type, sorted descending by count
- [ ] Accepts `vault=` and folder parameters; excludes `_vocab*`, `_topk*`, `_ontology*`, `tpl-*`
- [ ] Emits JSON when `--json`: `{"edges":[{"source":"...","rel":"...","target":"...","context":"..."}],"summary":{"depends-on":3,...},"unknownTypes":["..."]}`
- [ ] Exits 0 in all cases
- [ ] `tests/test-cli-relations.sh` passes in the test harness

## Additional Information

Parses `## Connections` section body with `app.vault.cachedRead` and a line-level regex. Loads valid relationship types from `_ontology.[project].md` using `obsidian eval` to read the file and `awk` to extract the first column of the `## Relationship Types` table.

> [!important]
> The edge output is the primary input to `sync-ontology.sh` (STORY-014) for missing inverse detection. The JSON format must be stable — changes to the edge schema will break STORY-014 and the Auditor subagent.

## System Design

- [PLAN.md — Story 011](../PLAN.md)
- [obsidian_docs.md — v11 §10 Connections format, relationship types table](../obsidian_docs.md)

## Resources

- [JavaScript regex for `## Connections` section](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions): `/^- ([a-z-]+) :: \[\[([^\]]+)\]\](?:\s*—\s*(.*))?$/gm` matches typed connection lines and captures rel, target wikilink, and optional context
- [awk column extraction from Markdown table](https://www.gnu.org/software/gawk/manual/gawk.html): `awk -F'|' 'NR>2 && /^\|/ {gsub(/[[:space:]`]/, "", $2); print $2}' \_ontology.md` extracts relationship type names, skipping the header and separator rows
- [sort + uniq -c for frequency counts](https://ss64.com/mac/uniq.html): `sort | uniq -c | sort -rn` produces descending frequency counts; wrap output in `awk` to format as `rel: count` pairs

## Recommendations

- Load the `_ontology` valid types set once per project at script start, then validate each extracted edge against it during the parse pass
- Include the `context` string (text after `—`) in the JSON edge output — it is useful for the Auditor subagent to surface actionable relationship descriptions
- The test fixture should include at least one unknown relationship type to verify the warning path without halting

---

> **Blocks**:
>
> - STORY-014 ⛔ — Implement sync-ontology.sh (uses edge list from cli-relations)
> - STORY-015 ⛔ — Implement weekly-review.sh (relations check is included in the review sequence)
