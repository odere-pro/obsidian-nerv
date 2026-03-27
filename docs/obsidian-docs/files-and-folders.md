# Files and Folders

## Accepted file formats

| Category | Extensions                                                        |
| -------- | ----------------------------------------------------------------- |
| Markdown | `.md`                                                             |
| Bases    | `.base`                                                           |
| Canvas   | `.canvas`                                                         |
| Images   | `.avif`, `.bmp`, `.gif`, `.jpeg`, `.jpg`, `.png`, `.svg`, `.webp` |
| Audio    | `.flac`, `.m4a`, `.mp3`, `.ogg`, `.wav`, `.webm`, `.3gp`          |
| Video    | `.mkv`, `.mov`, `.mp4`, `.ogv`, `.webm`                           |
| PDF      | `.pdf`                                                            |

Community plugins extend support for additional formats.

---

## The configuration folder

The `.obsidian` folder sits at the vault root and stores all vault-specific settings.

**Reveal the `.obsidian` folder on macOS**

Press `Cmd+Shift+.` in Finder to show hidden files.

**Change the configuration folder**

1. Open **Settings → Files and Links → Override config folder**.
2. Enter a name starting with `.` (e.g., `.obsidian-work`).
3. Relaunch Obsidian.

**Global settings location (macOS)**

```text
~/Library/Application Support/obsidian
```

**Git users** — add these files to `.gitignore` to avoid noisy diffs:

```text
.obsidian/workspace.json
.obsidian/workspaces.json
```

---

## Manage notes

| Action        | Method                                                               |
| ------------- | -------------------------------------------------------------------- |
| Create note   | `Cmd+N`, or File Explorer → right-click folder → New note            |
| Rename note   | Click note title or press `F2`; all links update automatically       |
| Delete note   | More options → Delete file, or Command Palette → Delete current file |
| Deleted files | Controlled via **Settings → Files & Links → Deleted files**          |

**Deleted file destinations**

| Option             | Behavior                                   |
| ------------------ | ------------------------------------------ |
| System trash       | Default. Restore via the OS trash / Finder |
| Obsidian trash     | Moves to `.trash` folder inside the vault  |
| Permanently delete | Immediate, irreversible deletion           |
