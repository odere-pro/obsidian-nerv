---
title: 'Add plugin development cycle tooling to dev skills'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 5
epic: 'EPIC-009 — CLI Skill Integration'
planKey: 'STORY-030'
phase: 6
sequence: 4
parallelTrack: B
size: 'M — ~0.5 day'
dependsOn:
  - STORY-023
  - STORY-027
blocks: []
decisionGate: ~
validationBasis: 'Verified by executing the full plugin dev feedback cycle (reload → errors → console → screenshot) against a test plugin in the dev-projectA vault'
---

## Goal

Extend the dev-domain skills from STORY-023 with a complete plugin development feedback cycle using 7 Obsidian CLI dev commands: `plugin:reload`, `dev:errors`, `dev:console`, `dev:screenshot`, `dev:dom`, `dev:css`, `dev:mobile`.
Document the 4-step feedback cycle (code → reload → verify → iterate) in the `dev-projectA/CLAUDE.md` agent config so the dev agent can drive plugin development autonomously.

## Acceptance Criteria

- [ ] `dev-projectA/CLAUDE.md` contains a `## Plugin Development Cycle` section documenting the 4-step feedback cycle: (1) edit plugin source, (2) `obsidian plugin:reload <plugin-id>`, (3) verify with `obsidian dev:errors` and `obsidian dev:console`, (4) iterate or capture with `obsidian dev:screenshot`
- [ ] All 7 dev commands are documented in `dev-projectA/CLAUDE.md` with: command syntax, when to use, and example output
- [ ] A new rule in `dev-projectA/CLAUDE.md` states: "When the user asks to test or debug a plugin, execute the 4-step feedback cycle. Start with `plugin:reload`, then check `dev:errors` — if errors exist, display them and stop. If no errors, proceed to `dev:console` for warnings."
- [ ] `obsidian plugin:reload <plugin-id>` executes successfully against a test plugin in the dev-projectA vault (exit 0)
- [ ] `obsidian dev:errors` returns the current error list (or empty) without error
- [ ] `obsidian dev:console` captures console output from the running Obsidian instance
- [ ] `obsidian dev:screenshot` captures a viewport screenshot and returns the file path
- [ ] `obsidian dev:dom` and `obsidian dev:css` return DOM tree and computed CSS respectively
- [ ] `obsidian dev:mobile` toggles mobile emulation mode

## Additional information

The 7 dev commands are unique to the `obsidian-cli` skill — no existing shell script wraps them.
These commands are direct CLI invocations, not `eval` patterns — they align with the decision boundary from STORY-027 (single-step operations, no atomicity required).
The plugin development cycle is a dev-only workflow; study vaults do not use these commands.

> [!important]
> The `plugin:reload` command requires the plugin ID (the directory name under `.obsidian/plugins/`), not the display name. Document this distinction clearly — passing the display name causes a silent failure with exit 0 but no reload.

## System design

- [PLAN.md — Story 030](../PLAN.md)
- [dev-projectA/CLAUDE.md — existing dev agent config](../../cli/agent/dev-projectA/CLAUDE.md)
- [STORY-023 — dev-specific skills (prerequisite)](STORY-023.md)
- [obsidian-skill-documentation.md — CLI dev command reference](../obsidian-skill-documentation.md)

## Resources

- [Obsidian CLI dev commands](../obsidian-skill-documentation.md): `dev:errors`, `dev:console`, `dev:screenshot`, `dev:dom`, `dev:css`, and `dev:mobile` are documented in the CLI skill reference; confirm exact syntax and flags before implementing
- [Obsidian plugin development documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin): plugin reload via CLI replaces the manual "Disable → Enable" toggle in Settings → Community plugins; the CLI command triggers the same internal `unload → load` sequence
- [kepano/obsidian-skills Plugin & Theme Development section](https://github.com/kepano/obsidian-skills): documents the `obsidian plugin:reload` command and the recommended feedback cycle for plugin development

## Recommendations

- Create a `dev-cycle.sh` convenience script in `~/.ontology-cli/dev/` that runs the full 4-step cycle: `plugin:reload "$1" && obsidian dev:errors && obsidian dev:console | tail -20 && echo "Cycle complete"` — a single command shortcut for the multi-step workflow
- Add `dev:screenshot` output to the ADR workflow from STORY-023: capture a screenshot when recording a UI-related architecture decision as visual evidence
- Test the `dev:mobile` toggle early — mobile emulation mode may require Obsidian to be in a specific window state; document any prerequisites

## Security considerations

| Area                    | Risk                                                                        | Mitigation                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Plugin ID validation    | Passing an arbitrary string as plugin ID could trigger unexpected behaviour | Validate the plugin ID against `.obsidian/plugins/` directory listing before calling `plugin:reload`                              |
| Console output exposure | `dev:console` may contain sensitive data (API keys, tokens) from plugins    | Document that `dev:console` output should not be committed to version control or shared in public channels                        |
| Screenshot file path    | `dev:screenshot` writes a file to a location determined by the CLI          | Verify the screenshot path is within a known directory (e.g., `/tmp/` or the vault's `_inbox/`) before referencing in other tools |

---

> **Depends on**:
>
> - STORY-023 — dev-specific skills must exist before extending with dev cycle
> - STORY-027 — decision boundary must be documented before adding direct CLI commands
