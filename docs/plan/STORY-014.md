---
title: 'Implement sync-ontology.sh autonomic skill'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-004 — Autonomic Skills: Sync and Review'
planKey: 'STORY-014'
phase: 3
sequence: 6
parallelTrack: C
size: 'L — ~1 day'
dependsOn:
  - STORY-003
  - STORY-011
blocks:
  - STORY-015
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 014 acceptance criteria'
---

## Goal

Author `sync-ontology.sh` in `~/.ontology-cli/core/` to produce a comprehensive health report for a project: entity distribution, relationship usage, missing inverse detection, and schema completeness. This is the most thorough autonomic diagnostic — it cross-references all forward connections against their declared inverses.

## Acceptance Criteria

- [ ] `sync-ontology.sh study aws` produces a report containing: entity type counts, kind distribution, spine distribution, status distribution, relationship type usage counts, list of missing inverses, schema completeness count, and a summary line: `Total: N notes, M edges, avg X.X edges/note, P incomplete, Q missing inverses`
- [ ] Re-running produces an identical report (idempotent)
- [ ] Accepts `vault=` parameter; exits 0 on success, 1 on error
- [ ] Emits JSON when `--json`: `{"entities":{"ROOT":N,"BRANCH":N,"LEAF":N},"edges":M,"missingInverses":[{"source":"...","rel":"...","target":"..."}],"incomplete":P}`
- [ ] `tests/test-sync-ontology.sh` passes in the test harness

## Additional Information

Cross-references all forward connections against their inverses — for each `A --rel--> B`, verifies B has `inverse(rel) :: [[A]]` in its Connections section. Inverse lookup uses the project's `_ontology` relationship types table. This health report is the primary output consumed by the Auditor subagent's missing-inverse triage path.

> [!important]
> `cli-relations.sh --json` (STORY-011) must be called to obtain the edge list — do not reimplement edge parsing. `sync-ontology.sh` is a higher-order diagnostic that composes on top of `cli-relations.sh` output.

## System Design

- [PLAN.md — Story 014](../PLAN.md)
- [obsidian_docs.md — v11 §10 Bidirectional connections, inverse relationship types](../obsidian_docs.md)

## Resources

- [`cli-relations.sh --json` edge list schema](../PLAN.md): `{"edges":[{"source":"...","rel":"...","target":"...","context":"..."}]}` — pipe this into `sync-ontology.sh` or call it as a subprocess and parse the output with `python3 -c "import json,sys; data=json.load(sys.stdin)"`
- [Obsidian `app.metadataCache.getBacklinksForFile(file).data`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getBacklinksForFile): returns a map of `{filePath: LinkCache[]}` representing all notes that link to the given file; use to cross-check expected inverse links
- [Python `collections.Counter` for distribution counts](https://docs.python.org/3/library/collections.html#collections.Counter): `Counter(e['rel'] for e in edges)` produces relationship usage counts; `most_common()` for sorted output — use `python3 -c "import json,sys,collections; ..."` inline

## Recommendations

- Structure the report output with clear sections for each metric category so the Auditor subagent can extract specific sections without parsing the entire report
- The missing inverses list is the highest-priority finding — place it first in the JSON output and at the top of the human-readable report
- Compute `avg edges/note` as `total_edges / max(note_count, 1)` to avoid division by zero on empty projects

---

> **Blocks**:
>
> - STORY-015 ⛔ — Implement weekly-review.sh (sync-ontology is part of the review sequence)
