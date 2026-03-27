# Obsidian CLI (macOS)

The CLI is bundled inside Obsidian and communicates with the running app via IPC. Every command routes through Obsidian's runtime — so `move` updates internal links, `create` applies templates, and `properties:set` writes valid YAML.

**Version**: 1.12.4+ (free for all users as of February 2026)

> [!important]
> Obsidian must be running for any CLI command to work.

---

## Installation

**Step 1 — Update Obsidian** to v1.12.4+ from [obsidian.md/download](https://obsidian.md/download). Verify at **Settings → About**.

**Step 2 — Enable the CLI** at **Settings → General → Command line interface** → toggle on → click **Register CLI**.

**Step 3 — Add to PATH**. Obsidian registers the binary via `~/.zprofile` automatically for zsh. For bash or fish, add manually:

```bash
# ~/.bash_profile or ~/.bashrc
export PATH="$PATH:/Applications/Obsidian.app/Contents/MacOS"
```

```fish
# ~/.config/fish/config.fish
set -gx PATH $PATH /Applications/Obsidian.app/Contents/MacOS
```

Restart your terminal or run `source ~/.zprofile`.

**Verify**:

```bash
obsidian version   # → Obsidian CLI 1.12.4
obsidian vault     # → My Knowledge Vault
obsidian files     # → total 2,847 notes
```

---

## Two operating modes

**Direct commands**:

```bash
obsidian help
obsidian daily
obsidian search query="meeting notes"
```

**TUI (interactive Terminal UI)**:

```bash
obsidian    # launches interactive session with autocomplete
```

**TUI shortcuts**:

| Action            | Shortcut            |
| ----------------- | ------------------- |
| Accept suggestion | `Tab`               |
| Dismiss           | `Shift+Tab`         |
| Search history    | `Ctrl+R`            |
| Previous command  | `↑` / `Ctrl+P`      |
| Clear screen      | `Ctrl+L`            |
| Exit              | `Ctrl+C` / `Ctrl+D` |

---

## Command reference

**Notes and daily notes**:

```bash
obsidian daily                                       # open today's daily note
obsidian daily:append content="- [ ] Buy groceries"  # append to daily note
obsidian read                                         # read the active file
obsidian create name="Trip to Paris" template=Travel  # create from template
obsidian diff file=README from=1 to=3                 # diff two versions
```

**Search and discovery**:

```bash
obsidian search query="meeting notes"
obsidian search query="status::active" vault="Notes" format=json
obsidian tags counts
obsidian unresolved
obsidian files sort=modified limit=5
obsidian files sort=modified limit=5 --copy
```

**Developer tools**:

```bash
obsidian devtools
obsidian plugin:reload my-plugin
obsidian dev:screenshot file=shot.png
obsidian eval "app.vault.getFiles().length"
obsidian dev:errors
obsidian dev:css selector=".workspace"
obsidian dev:dom selector=".nav"
```

---

## Automation examples

**Morning routine script**:

```bash
#!/bin/bash
obsidian daily
obsidian daily:append content="## Morning Checklist"
obsidian daily:append content="- [ ] Review inbox"
obsidian daily:append content="- [ ] Check calendar"
obsidian daily:append content="- [ ] Plan top 3 priorities"
obsidian files sort=modified limit=5 --copy
obsidian unresolved
```

Schedule via cron (runs at 08:00 on weekdays):

```bash
chmod +x ~/scripts/morning.sh
# 0 8 * * 1-5 /Users/you/scripts/morning.sh
```

**Meeting note creator**:

```bash
#!/bin/bash
MEETING_NAME=$1
DATE=$(date +%Y-%m-%d)

obsidian create name="${DATE} ${MEETING_NAME}" template=Meeting
obsidian daily:append content="- [[${DATE} ${MEETING_NAME}]] — notes"
```

**Plugin development auto-reload**:

```bash
#!/bin/bash
PLUGIN=$1
obsidian plugin:reload "$PLUGIN"
obsidian dev:errors
obsidian dev:screenshot file="screenshots/${PLUGIN}-$(date +%s).png"
```

Pair with `fswatch` for auto-reload on file save:

```bash
fswatch -o ~/obsidian-plugins/my-plugin/main.js | \
  xargs -n1 -I{} obsidian plugin:reload my-plugin
```

**Export active projects as JSON**:

```bash
obsidian search query="status::active" vault="Work" format=json > active-projects.json
```

---

## Tips and gotchas

- Run `obsidian help` to browse all 100+ commands and their options.
- Never run with elevated privileges — `sudo obsidian` breaks IPC communication.
- Use `vault="VaultName"` to target a specific vault when multiple are open.
- Test bulk-modification scripts on a copy of the vault before running on production data.
