# Obsidian CLI Skill

**Skill name:** `obsidian-cli`

Provides a command-line interface for interacting with a running Obsidian instance. Requires Obsidian to be open and active. Enables vault operations, note management, and plugin/theme development workflows.

**Activate when:** the user asks to interact with Obsidian via CLI, manage plugins, reload themes, or debug the app.

---

## Command syntax

Parameters use `=` assignment; flags are boolean switches.

```bash
obsidian create name="My Note"
obsidian read file="My Note"
obsidian append file="My Note" content="New paragraph"
```

File targeting: use `file` (wikilink style) or `path` (absolute vault path).

---

## Note operations

| Operation        | Example                                          |
| ---------------- | ------------------------------------------------ |
| Read a note      | `obsidian read file="Note Name"`                 |
| Create a note    | `obsidian create name="Note Name"`               |
| Append to a note | `obsidian append file="Note Name" content="..."` |
| Search vault     | `obsidian search query="keyword"`                |
| List tags        | `obsidian tags`                                  |
| List backlinks   | `obsidian backlinks file="Note Name"`            |

---

## Developer tools

| Command                  | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `obsidian plugin:reload` | Hot-reload a plugin after code changes                   |
| `obsidian dev:errors`    | Capture console errors in the terminal                   |
| `obsidian dev:console`   | Stream console output to the terminal                    |
| `obsidian dev:dom`       | Inspect the Obsidian DOM                                 |
| `obsidian eval`          | Execute arbitrary JavaScript in the Obsidian app context |
