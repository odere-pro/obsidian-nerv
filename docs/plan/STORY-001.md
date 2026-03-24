---
title: 'Bootstrap vault environment'
team: 'Obsidian Nervous System'
priority: 'Blocker'
storyPoints: 8
epic: 'EPIC-001 — Foundation and Environment'
planKey: 'STORY-001'
phase: 1
sequence: 1
parallelTrack: A
size: 'XL — ~2 days'
dependsOn: []
blocks:
  - STORY-002
  - STORY-005
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 001 acceptance criteria'
---

## Goal

Author `bootstrap-vault.sh` as a single idempotent shell script that provisions the entire obsidian-nerv framework substrate for a named vault: creates the vault directory, writes all `.obsidian/*.json` configuration files, scaffolds the vault folder hierarchy, creates all note and base templates, initializes Git backup, creates the host-level `~/.ontology-cli/` script directory tree, and appends PATH exports to `~/.zprofile`.

## Acceptance Criteria

- [ ] `bootstrap-vault.sh study ~/vaults/study` creates the vault directory, all `.obsidian/` config files, all vault folders, all templates, all base files, the host script directory, and the Git repository in one invocation
- [ ] `.obsidian/app.json` contains correct settings: default new note location `_inbox`, link format shortest-path, wikilinks enabled, auto-update internal links enabled, attachment subfolder `_attachments`, deleted files to system trash, excluded files `_templates/*` and `_scripts/*`
- [ ] `.obsidian/core-plugins.json` enables all 18 required plugins: Templates, Backlinks, Outgoing Links, Graph View, Search, Page Preview, Tags View, Quick Switcher, Command Palette, Bookmarks, Properties View, Note Composer, Outline, Bases, File Recovery, Word Count, Daily Notes, Workspaces
- [ ] `.obsidian/templates.json` sets folder `_templates/` and date format `YYYY-MM-DD`; `.obsidian/daily-notes.json` sets date format `YYYY-MM-DD`, folder `journals/daily/`, template `_templates/tpl-daily.md`
- [ ] `.obsidian/hotkeys.json` binds all 9 custom hotkeys: Alt+T, Cmd+O, Cmd+Shift+F, Cmd+G, Alt+B, Cmd+;, Alt+C, Alt+D, Alt+W
- [ ] `.obsidian/graph.json` configures arrows enabled, tags enabled, attachments enabled, color group `path:_inbox/` as red
- [ ] Vault folders created: `_inbox/`, `_templates/`, `_scripts/`, `_scripts/cli/`, `_bases/`, `journals/daily/`, `projects/`
- [ ] All 10 template files written to `_templates/`: `tpl-root.md`, `tpl-branch.md`, `tpl-leaf.md`, `tpl-inbox.md`, `tpl-daily.md`, `tpl-ontology.md`, `tpl-vocab.md`, `tpl-topk.md`, `tpl-project.base`
- [ ] All 3 vault-wide audit bases written to `_bases/`: `audit-missing-properties.base`, `audit-drafts.base`, `audit-orphans.base`
- [ ] Host directories created: `~/.ontology-cli/core/`, `~/.ontology-cli/agent/`, `~/.ontology-cli/study/`, `~/.ontology-cli/dev/`; PATH export appended to `~/.zprofile` (idempotent)
- [ ] Git initialized at vault root with `.gitignore` containing `.obsidian/workspace.json` and `.obsidian/workspaces.json`; initial commit includes `.obsidian/` and all created files
- [ ] Re-running on an existing vault exits 0 with no file modifications (idempotent)
- [ ] `bootstrap-vault.sh dev-projectA ~/vaults/dev-projectA` produces an identical structure for a second vault

## Additional Information

Template content must match v11 §14 exactly. `tpl-root.md` requires `type: ROOT` and all v11 §8 frontmatter fields. `tpl-ontology.md` must contain the 10 default relationship types table pipe-delimited with backtick-wrapped type names for `awk` parsing. `tpl-project.base` must include `PROJECT_SLUG_PLACEHOLDER` for `sed` replacement.

> [!important]
> Hotkey IDs are Obsidian internal command IDs — reference `hotkeys.json` format from an existing Obsidian vault to derive the correct command strings. Workspaces and bookmarks require Obsidian to be open with panels arranged — write placeholder files that the operator finalizes in STORY-002.

## System Design

- [PLAN.md — Story 001](../PLAN.md)
- [obsidian_docs.md — v11 §8 Frontmatter, §14 Templates, §6.3 Audit Bases](../obsidian_docs.md)

## Resources

- [Obsidian v11 app.json schema](https://help.obsidian.md/Extending+Obsidian/App+settings): `userIgnoreFilters` accepts glob patterns for excluded files; `newFileLocation` accepts `"root"`, `"current"`, or `"folder"` — use `"folder"` with `"newFileFolderPath": "_inbox"` for inbox routing
- [Obsidian Bases plugin (.base format)](https://help.obsidian.md/Plugins/Bases): `.base` files are JSON with a `views` array; each view requires `type`, `name`, and `filter` fields; formula columns use single-quoted string syntax
- [macOS `sed -i ''` for in-place editing](https://ss64.com/mac/sed.html): BSD `sed` requires an empty string argument `''` after `-i` unlike GNU sed; use `sed -i '' 's/PLACEHOLDER/value/g' file`

## Recommendations

- Write the script in stages: directories first, then JSON config files, then templates, then Git init — this ordering makes the idempotency check simpler (check if the first output exists before proceeding)
- Use `[ -f "$file" ] || cat > "$file" <<'EOF'` pattern for each config file to guarantee idempotency without overwriting user modifications
- Run `bootstrap-vault.sh` on a throwaway vault first to verify all JSON is valid before using on real vaults

## Security Considerations

| Area            | Risk                                                                   | Mitigation                                                                 |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Shell injection | `VAULT_NAME` and `VAULT_PATH` parameters passed to `mkdir`, `git init` | Quote all variables: `"$VAULT_PATH"` — never interpolate unquoted          |
| Path traversal  | Relative paths in `VAULT_PATH` could target unintended directories     | Resolve to absolute path with `realpath` or `$(cd "$1" && pwd)` before use |
| Idempotency     | Re-running could overwrite user-modified config files                  | Guard every `cat >` write with `[ -f "$target" ]` existence check          |

---

> **Blocks**:
>
> - STORY-002 ⛔ — Register CLI and verify manual setup
> - STORY-005 ⛔ — Implement create-project.sh skill (templates must exist)
