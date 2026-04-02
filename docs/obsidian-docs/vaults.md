# Vaults

A **vault** is a folder on your local file system where Obsidian stores notes as plain-text Markdown files. Obsidian creates a hidden `.obsidian` folder inside each vault to store settings, plugins, themes, and snippets. Because vaults are ordinary folders, you own the data completely — no proprietary format, no lock-in.

---

## Create a vault

**New empty vault**

1. Open Obsidian. The Vault Switcher opens on first launch.
2. Select **Create new vault → Create**.
3. Enter a vault name.
4. Click **Browse** to choose a location on disk.
5. Click **Create**.

**Open an existing folder**

1. In the Vault Switcher, click **Open folder as vault → Open**.
2. Select the target folder. Obsidian creates the `.obsidian` configuration folder inside it.

**Mobile (iOS)**

1. Open Obsidian and tap **Create new vault**.
2. Enter a name.
3. Toggle **Store in iCloud** to enable iCloud sync.
4. Tap **Create**.

---

## The sandbox vault

The **sandbox vault** ships with Obsidian desktop and lets you test features, plugins, and themes without affecting real data. If a problem does not reproduce in the sandbox, a community plugin or theme is likely the cause.

Open via **Command Palette → Open sandbox vault**, or via the **Help** icon in the left sidebar.

> [!note]
> The sandbox vault is not available on mobile. Download a copy from the [obsidian-help GitHub repository](https://github.com/obsidianmd/obsidian-help) if needed.

---

## Manage vaults

Access vault management via the **Vault profile** icon at the bottom of the left sidebar, or via **Command Palette → Open another vault**.

| Action           | Steps                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Rename vault     | Vault profile → Manage Vaults → ⋯ → Rename vault                         |
| Move vault       | Vault profile → Manage Vaults → ⋯ → Move vault (then select new path)    |
| Remove from list | Vault profile → Manage Vaults → ⋯ → Remove from list (files unchanged)   |
| Copy settings    | Copy `.obsidian` folder from source vault root to destination vault root |

> [!warning]
> Do not create a vault inside the Obsidian system settings folder — this can cause data corruption.

---

## Import notes from other apps

Install the **Importer** community plugin (**Settings → Community plugins → Browse → Importer**), then run **Importer: Open Importer**.

| Source format                                 | Notes                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Apple Notes                                   | macOS only; reads local SQLite database; converts text, tables, images, PDFs, checklists               |
| CSV                                           | Each row becomes a note; columns map to frontmatter; configure name/content/property columns           |
| Markdown                                      | Converts non-standard link formats to wiki-links; or copy `.md` files directly if no conversion needed |
| HTML                                          | Extracts text, converts to Markdown, saves embedded images as attachments                              |
| Evernote / Notion / Roam / Bear / Google Keep | Supported via the same Importer plugin                                                                 |

**Apple Notes import steps**

1. Ensure notes are synced locally in the Notes app before importing.
2. Run **Importer: Open Importer** → choose **Apple Notes**.
3. Select an output folder inside your vault.
4. Click **Import**.

**CSV import steps**

1. Run **Importer: Open Importer** → choose **CSV**.
2. Select your `.csv` file.
3. Set the **Note name column**, **Note content column**, and any frontmatter columns.
4. Click **Import**.

---

## Sync across devices

> [!important]
> Never run two sync services on the same vault simultaneously — this causes conflicts and data corruption.

| Method        | Platforms               | Cost                |
| ------------- | ----------------------- | ------------------- |
| Obsidian Sync | All                     | Paid subscription   |
| iCloud        | macOS, iOS              | Free (Apple ID)     |
| OneDrive      | Windows, macOS          | Free tier available |
| Google Drive  | Windows, macOS, Android | Free tier available |
| Syncthing     | Windows, macOS, Linux   | Free / open-source  |
| Git           | All (manual)            | Free                |

**iCloud setup (recommended for Apple users)**

1. Enable iCloud Drive on all devices: **System Settings → Apple ID → iCloud → iCloud Drive**.
2. Create the vault on iPhone first with **Store in iCloud** toggled on — this creates `iCloud Drive/Obsidian/<VaultName>`.
3. On your Mac, open the vault via **Vault Switcher → Open folder as vault** → navigate to `iCloud Drive → Obsidian → <VaultName>`.
4. Right-click the Obsidian folder in Finder → **Keep Downloaded** to prevent file offloading.

---

## Back up your vault

Sync services are not backups — they replicate deletions instantly. Use at least one off-device, point-in-time backup.

| Method                | Notes                                                           |
| --------------------- | --------------------------------------------------------------- |
| Time Machine (macOS)  | Continuous local backup of the entire vault folder              |
| Backblaze / Carbonite | Cloud backup with version history                               |
| External drive        | Manual copy; simple but can be lost or damaged                  |
| Obsidian Git plugin   | Commits vault to a Git repo on a schedule; full version history |

Back up the entire vault folder, including `.obsidian`.
