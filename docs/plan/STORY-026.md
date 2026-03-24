---
title: 'Validate documentation and cross-references'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 3
epic: 'EPIC-008 — Schema Evolution and Quality Assurance'
planKey: 'STORY-026'
phase: 5
sequence: 5
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-025
blocks: []
decisionGate: ~
validationBasis: 'Verified by executing all CLI examples in the docs against the STORY-025 E2E test vault'
---

## Goal

Audit the v11 framework document, the Ontology CLI companion guide, and the Agent Layer document for accuracy, completeness, and internal consistency. Verify every CLI example executes successfully, every cross-reference resolves, and every limitation is documented. This is a validation checklist story, not a writing task — all documentation content is authored incrementally in the stories that produce each skill.

## Acceptance Criteria

- [ ] v11 §2.11 correctly references the CLI registration procedure from STORY-002; §20 (Triage and Weekly Review workflows) references `create-entity.sh`, `add-connection.sh`, and `weekly-review.sh` by their exact command signatures; §22 (Decomposition Flow) maps each step to its corresponding CLI skill
- [ ] Ontology CLI companion guide documents all skills from STORY-005 through STORY-024 with: command signature, all parameters including `vault=` and `--json`, example invocation, example output, and idempotency behavior
- [ ] Agent Layer document contains: `CLAUDE.md` template for each vault type, skill registry listing all capabilities grouped by subagent, `patterns.md` decision trees for all routing cases, and a `## Limitations` section covering all limitations (L1–L5, L7–L8)
- [ ] All CLI example invocations in all three documents execute successfully against the test vault from STORY-025
- [ ] No broken cross-references exist between the three documents
- [ ] `_inbox/_rollback-log.md` recovery workflow is documented in the Agent Layer document's failure modes section
- [ ] `migrate.sh` migration spec format and supported operations are documented in the Ontology CLI companion guide

## Additional Information

This story covers the validation pass — not the authoring. Documentation is written incrementally in each skill story. This final story confirms the documentation is accurate and complete before the framework is considered production-ready.

> [!important]
> iOS limitation (L6) is explicitly out of scope — do not document it. Include limitations L1 (Obsidian must be running), L2 (single vault per session), L3 (CLI requires macOS), L4 (no web vault support), L5 (one agent session per vault at a time), L7 (Bases requires Obsidian open), L8 (daily note requires today's note to exist or be creatable).

## System Design

- [PLAN.md — Story 026](../PLAN.md)
- [obsidian_docs.md — v11 full document, all sections](../obsidian_docs.md)

## Resources

- [Bash script for validating CLI examples](https://www.gnu.org/software/bash/manual/bash.html): write a validation script that sources each CLI example from the companion guide and runs it against the E2E test vault; capture exit codes and report failures
- [Markdown link checker](https://github.com/tcort/markdown-link-checker): `npx markdown-link-checker <file>` checks all `[text](url)` links and wikilinks in a Markdown file; use for cross-reference validation between the three documents
- [Obsidian CLI `--version` for environment documentation](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI): include the minimum required Obsidian version (≥ 1.12.4) and CLI version in the companion guide's prerequisites section

## Recommendations

- Create a simple validation script `validate-docs.sh` that runs through all CLI examples in the companion guide in order — this script becomes part of the repo and can be run by any new contributor to verify their environment
- Use Obsidian's own link resolution to check cross-references between documents: run `obsidian unresolved` against the docs vault to find any broken internal links
- Mark any known limitations that are Obsidian-version-specific with the minimum version required — this prevents confusion when the limitation is lifted in a future Obsidian release

---
