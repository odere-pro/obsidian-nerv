---
title: 'Build compiled binary, update PATH, remove Bash scripts'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 5
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-038'
phase: 7
sequence: 6
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-033
  - STORY-034
  - STORY-035
  - STORY-036
  - STORY-037
blocks: []
decisionGate: ~
validationBasis: 'bin/nerv --version prints package version; bun test exits 0; bun test:integration exits 0 with OBSIDIAN_RUNNING=1; ls cli/ returns not found; CLAUDE.md files reference nerv not .sh scripts'
---

## Goal

Produce the compiled `nerv` binary via `bun build --compile`, update `bootstrap-vault.sh` to install the binary and remove legacy Bash PATH entries, delete the entire `cli/` directory from the repository, and update all agent configuration files (`CLAUDE.md`, `skills.md`, `patterns.md`) to reference `nerv` commands instead of Bash scripts.

## Acceptance criteria

### Build

- [ ] `bun run build` produces `bin/nerv` — a self-contained single-file executable (no Bun installation required on the target machine)
- [ ] `bin/nerv --version` prints the `version` field from `package.json`
- [ ] `bin/nerv create-entity study testproj LEAF s3 "S3 Overview" ROOT concept aws` produces the same output as the former `create-entity.sh` invocation
- [ ] `bin/nerv context study "encryption"` produces valid JSON with the same schema as the former `context.sh`
- [ ] `bin/nerv weekly-review study aws --json` produces valid JSON with the same schema as the former `weekly-review.sh --json`
- [ ] `bin/` directory added to `.gitignore`

### PATH and bootstrap

- [ ] `bootstrap-vault.sh` updated: removes `${HOME}/.ontology-cli/core`, `${HOME}/.ontology-cli/dev`, `${HOME}/.ontology-cli/study` from PATH exports; adds `${HOME}/.ontology-cli/bin` to PATH
- [ ] `bootstrap-vault.sh` copies `bin/nerv` to `~/.ontology-cli/bin/nerv` during setup
- [ ] `package.json` `"bin"` field set to `{ "nerv": "./bin/nerv" }` for `npx`/`bunx` usage

### Bash removal

- [ ] `cli/core/` directory deleted from the repository (29 files: 23 scripts + 6 tests dirs)
- [ ] `cli/dev/` directory deleted from the repository (3 files)
- [ ] `cli/study/` directory deleted from the repository (3 files)
- [ ] `cli/core/tests/` directory deleted from the repository (all test-\*.sh files)
- [ ] `cli/core/test-harness.sh` deleted (replaced by `bun test`)
- [ ] `cli/core/tests/_helpers.sh` deleted (assertions replaced by `bun:test` `expect()`)

### Agent config updates

- [ ] `cli/agent/study/CLAUDE.md` updated: all skill invocation rules reference `nerv <command>` instead of `<script>.sh`; e.g., "invoke `nerv context` before answering any knowledge question" instead of "invoke `context.sh`"
- [ ] `cli/agent/dev-projectA/CLAUDE.md` updated: same pattern — `nerv adr`, `nerv dependency-map`, `nerv code-link`
- [ ] `cli/agent/skills.md` updated: all skill entries reference `nerv <command>` syntax with correct parameters
- [ ] `cli/agent/patterns.md` updated: all routing patterns reference `nerv` commands

### Documentation updates

- [ ] `docs/onthology-obsidian-cli-guide.md` (companion guide): all command signatures updated from `<script>.sh <vault> ...` to `nerv <command> <vault> ...`; Prerequisites section updated to reference `bin/nerv` instead of shell scripts on PATH
- [ ] `PATTERNS.md` remains in `cli/core/` until this story — move it to `docs/PATTERNS.md` as a reference document (it no longer needs to be on the script PATH)

### Test verification

- [ ] `bun test` (unit) exits 0 with zero failures — all unit tests pass without Obsidian
- [ ] `bun test:integration` exits 0 with `OBSIDIAN_RUNNING=1` — all integration tests pass against a live Obsidian instance
- [ ] `bun run typecheck` exits 0 — no TypeScript errors after Bash removal

## Additional information

This is a destructive story — it removes 35+ files from the repository.
The `cli/agent/` directory is NOT deleted — it contains `CLAUDE.md`, `skills.md`, and `patterns.md` which are agent configuration, not Bash scripts.
The Obsidian CLI (`obsidian` binary itself) is unchanged — `nerv` continues to call `obsidian eval`, `obsidian daily:append`, etc. as subprocesses.

> [!important]
> Execute Bash removal as the LAST step, after all tests pass and the binary is verified.
> If any test fails after Bash removal, the `cli/` recovery path is `git checkout -- cli/` — ensure this is documented in the rollback procedure.
> Do NOT delete Bash scripts until the binary produces identical output for every command.

## System design

- [PLAN.md — Story 038](../PLAN.md)
- [bootstrap-vault.sh — PATH update target](../../bootstrap-vault.sh)
- [cli/agent/study/CLAUDE.md — agent config requiring nerv references](../../cli/agent/study/CLAUDE.md)
- [cli/agent/dev-projectA/CLAUDE.md — agent config requiring nerv references](../../cli/agent/dev-projectA/CLAUDE.md)
- [cli/agent/skills.md — skill registry requiring nerv references](../../cli/agent/skills.md)
- [cli/agent/patterns.md — routing patterns requiring nerv references](../../cli/agent/patterns.md)

## Resources

- [Bun compile API](https://bun.sh/docs/bundler/executables): `bun build --compile src/cli.ts --outfile=bin/nerv` produces a single binary; supports `--target=bun-darwin-arm64` for Apple Silicon and `--target=bun-darwin-x64` for Intel
- [Git removal of directories](https://git-scm.com/docs/git-rm): `git rm -r cli/core/ cli/dev/ cli/study/` removes tracked files; commit message should reference STORY-038 and the migration epic
- [CLAUDE.md command reference format](https://docs.anthropic.com/en/docs/claude-code/memory): rules written as `invoke \`nerv context\` before answering...` — the backtick-wrapped command is the agent's invocation target

## Recommendations

- Run a full side-by-side comparison before deletion: for each of the 29 Bash scripts, run both `bash <script>.sh <args>` and `nerv <command> <args>` with the same inputs, diff the outputs, and log any discrepancies — automate this as a `verify-parity.ts` script
- Tag the commit immediately before Bash removal as `v1.0.0-bash-final` so the last Bash version is always recoverable via `git checkout v1.0.0-bash-final -- cli/`
- After removal, run `bun run typecheck && bun test && bun test:integration` as a single CI-like gate before pushing — this catches any accidental import of deleted Bash helpers

## Security considerations

| Area                | Risk                                                             | Mitigation                                                                                            |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Binary distribution | Compiled binary could be tampered with between build and install | Build and install in a single `bootstrap-vault.sh` run; verify `nerv --version` post-install          |
| PATH hijacking      | Old `~/.ontology-cli/core/` PATH entry remains after update      | `bootstrap-vault.sh` must explicitly remove old PATH entries from `~/.zprofile` before adding new one |
| Rollback data loss  | Deleting `cli/` is irreversible if not committed properly        | Verify all Bash scripts are tracked in git before removal; tag the pre-deletion commit                |

---

> **Depends on** all 5 preceding migration stories:
>
> - STORY-033 — Motor skills
> - STORY-034 — Reflex/autonomic skills
> - STORY-035 — Sensory skills
> - STORY-036 — Orchestration skills
> - STORY-037 — Domain skills
