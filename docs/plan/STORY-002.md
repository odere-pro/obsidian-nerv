---
title: 'Register CLI and verify manual setup'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 2
epic: 'EPIC-001 — Foundation and Environment'
planKey: 'STORY-002'
phase: 1
sequence: 2
parallelTrack: A
size: 'S — ~2 h'
dependsOn:
  - STORY-001
blocks:
  - STORY-003
decisionGate: ~
validationBasis: 'Manual verification against PLAN.md §Story 002 acceptance criteria'
---

## Goal

Open docs/obsidian_docs vault in Obsidian, register the CLI binary, verify all `.obsidian/*.json` settings rendered correctly, finalize workspace layouts and bookmark groups that require live panel arrangement, and confirm that the Bases plugin renders all audit and template base files without errors. This is the only manual story in the plan.

## Acceptance Criteria

- [ ] Obsidian version ≥ 1.12.4 confirmed at Settings → About in docs/obsidian_docs vault
- [ ] CLI registered: `obsidian version` returns ≥ 1.12.4 from a new terminal session; `obsidian vault`, `obsidian files`, and `obsidian eval "1+1"` succeed in docs/obsidian_docs vault
- [ ] `obsidian files vault="study"` and `obsidian files vault="dev-projectA"` both return file counts without error
- [ ] All settings from STORY-001 verified visually in Settings → Files & Links, Settings → Editor, Settings → Templates, Settings → Daily Notes
- [ ] All 18 core plugins confirmed enabled at Settings → Core plugins; Bases plugin (≥ 1.9) present in list
- [ ] File Recovery snapshot interval is 5 minutes; history length is 30 days (Settings → File Recovery)
- [ ] "Show backlinks in document" activated via Command Palette → "Toggle backlinks in document"
- [ ] Three workspaces saved: `ontology-work`, `ontology-review`, `ontology-explore` with the layouts specified in PLAN.md §Story 002
- [ ] Three bookmark groups created: Ontology/, Audit Queries/ (7 saved search queries per v11 §2.7), Active Work/
- [ ] All 3 audit bases in `_bases/` and `tpl-project.base` in `_templates/` render valid table views with no YAML parse errors
- [ ] Alt+W opens workspace switcher; all three workspace names appear

## Additional Information

This story covers the small set of actions that require the Obsidian GUI to be running. Any `.obsidian/` config discrepancies found during verification must be corrected in `bootstrap-vault.sh` (STORY-001) and the script re-run — do not fix settings manually.

> [!important]
> CLI registration path: Settings → General → Command line interface → toggle ON → Register CLI. For zsh, Obsidian writes to `~/.zprofile` automatically. Obsidian must be running for all `obsidian eval` calls throughout the framework (Limitation L1).

## System Design

- [PLAN.md — Story 002](../PLAN.md)
- [obsidian_docs.md — v11 §2.7 Saved Searches, Workspace layouts](../obsidian_docs.md)

## Resources

- [Obsidian CLI registration](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI): after enabling CLI in settings, `obsidian eval` can run arbitrary JavaScript in the running Obsidian instance; the CLI binary is placed in the PATH by Obsidian automatically
- [Obsidian Bases plugin ≥ 1.9](https://help.obsidian.md/Plugins/Bases): `.base` files require the Bases core plugin enabled; version 1.9+ added formula column support required by `tpl-project.base`

## Recommendations

- Apply verification identically across docs/obsidian_docs vault — do not assume one vault is representative
- Save bookmark search queries by running each search first, then clicking the bookmark icon in the Search panel header
- Build each workspace layout before saving via Manage workspaces — the save captures the current panel state

---

> **Blocks**:
>
> - STORY-003 ⛔ — Implement core library (CLI must be registered)
