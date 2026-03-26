# PATTERNS.md — Canonical Obsidian eval CRUD Patterns

Internal reference for all skill authors (Stories 009–024) and the agent layer (Story 021).
These five patterns are the low-level primitives that every higher-level skill composes.

> **Convention**: all `obsidian eval` invocations use `vault=<name> code=<expr>`.
> Replace `vault=study` and note paths with your target vault and path.
> Each one-liner is a self-contained async IIFE that can be copy-pasted verbatim.

---

## Pattern 1 — Read Frontmatter as JSON

Read a note's frontmatter as a plain JavaScript object using the metadata cache.

### API

```
app.metadataCache.getFileCache(file)?.frontmatter
```

Returns the parsed frontmatter object (or `undefined` if the note has no frontmatter).
The cache is updated asynchronously after writes — use `vault.cachedRead` for body reads.

### One-liner

```bash
obsidian eval vault=study code="
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.ROOT - Amazon Web Services.md');
  JSON.stringify(app.metadataCache.getFileCache(f)?.frontmatter ?? {})
"
```

### Multi-property read

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.ROOT - Amazon Web Services.md');
  const fm = app.metadataCache.getFileCache(f)?.frontmatter ?? {};
  return JSON.stringify({ type: fm.type, spine: fm.spine, status: fm.status });
})()"
```

### Anti-pattern

> [!warning] Do NOT do this
>
> ```bash
> # BAD: manual YAML parse with grep/awk is fragile and misses multi-line values
> obsidian eval vault=study code="
>   const raw = await app.vault.cachedRead(
>     app.vault.getAbstractFileByPath('projects/aws/AWS.ROOT - Amazon Web Services.md')
>   );
>   raw.match(/^spine: (.+)$/m)?.[1]
> "
> ```
>
> Use `getFileCache(f)?.frontmatter` instead — it handles all YAML edge cases correctly.

---

## Pattern 2 — Update a Single Frontmatter Property

Set or update one frontmatter property without touching the rest of the document.

### API

```
app.fileManager.processFrontMatter(file, (fm) => { fm.key = value; })
```

The callback receives the live frontmatter object. Mutations are written back atomically.
Pass multiple assignments in a single callback to avoid multiple write round-trips.

### One-liner

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.EC2.ec2 - EC2.md');
  await app.fileManager.processFrontMatter(f, fm => { fm.status = 'published'; });
})()"
```

### Set multiple properties at once

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.EC2.ec2 - EC2.md');
  const today = new Date().toISOString().split('T')[0];
  await app.fileManager.processFrontMatter(f, fm => {
    fm.status = 'review';
    fm.modified = today;
  });
})()"
```

### Append to a YAML array field (e.g. children)

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.ROOT - Amazon Web Services.md');
  await app.fileManager.processFrontMatter(f, fm => {
    if (!Array.isArray(fm.children)) fm.children = [];
    const link = '[[AWS.ec2 - EC2]]';
    if (!fm.children.includes(link)) fm.children.push(link);
  });
})()"
```

### Anti-pattern

> [!warning] Do NOT do this
>
> ```bash
> # BAD: raw string replacement corrupts the YAML document on edge cases
> obsidian eval vault=study code="
>   const f = app.vault.getAbstractFileByPath('projects/aws/AWS.ec2 - EC2.md');
>   let raw = await app.vault.read(f);
>   raw = raw.replace(/^status: draft/m, 'status: published');
>   await app.vault.modify(f, raw);
> "
> ```
>
> `processFrontMatter` handles YAML serialisation, array types, and quoting for you.

---

## Pattern 3 — Append to a Named Section

Append content to a specific `## Heading` section within a note body.
Uses `app.vault.process` for an atomic read-modify-write — no separate read/write calls.

### API

```
app.vault.process(file, (content) => newContent)
```

The callback receives the full file content as a string and must return the modified string.
The write is atomic — no concurrent edit can interleave between read and write.

### One-liner: append a connection line

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.ec2 - EC2.md');
  await app.vault.process(f, content => {
    const line = '- depends-on :: [[AWS.vpc - VPC]]\n';
    const marker = '## Connections';
    const idx = content.indexOf(marker);
    if (idx === -1) return content;
    const insertAt = content.indexOf('\n', idx) + 1;
    return content.slice(0, insertAt) + '\n' + line + content.slice(insertAt);
  });
})()"
```

### Idempotent append (skip if line already present)

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.ec2 - EC2.md');
  const line = '- depends-on :: [[AWS.vpc - VPC]]';
  await app.vault.process(f, content => {
    if (content.includes(line)) return content;
    const marker = '## Connections';
    const idx = content.indexOf(marker);
    if (idx === -1) return content;
    const insertAt = content.indexOf('\n', idx) + 1;
    return content.slice(0, insertAt) + '\n' + line + '\n' + content.slice(insertAt);
  });
})()"
```

### Anti-pattern

> [!warning] Do NOT do this
>
> ```bash
> # BAD: separate read + modify + write creates a race window for concurrent edits
> obsidian eval vault=study code="
>   const f = app.vault.getAbstractFileByPath('projects/aws/AWS.ec2 - EC2.md');
>   const content = await app.vault.read(f);
>   await app.vault.modify(f, content + '\n- depends-on :: [[AWS.vpc - VPC]]\n');
> "
> ```
>
> Use `app.vault.process` so the read-modify-write is a single atomic operation.

---

## Pattern 4 — Move a Note (with automatic wikilink update)

Rename or move a note and have Obsidian automatically rewrite all internal wikilinks
that point to it. This is the required pattern for LEAF → BRANCH promotion (v11 §21).

### API

```
app.fileManager.renameFile(file, newPath)
```

- `newPath` is vault-relative (e.g. `projects/aws/AWS.ec2 - EC2.md`).
- The destination directory **must already exist** before calling `renameFile`.
- All internal wikilinks pointing to the old path are rewritten automatically.
- **Prefer this over `app.vault.rename`** — `vault.rename` does not update wikilinks.

### One-liner: rename within the same folder

```bash
obsidian eval vault=study code="
(async () => {
  const oldPath = 'projects/aws/AWS.leaf-a - Old Title.md';
  const newPath = 'projects/aws/AWS.leaf-a - New Title.md';
  const f = app.vault.getAbstractFileByPath(oldPath);
  if (f) await app.fileManager.renameFile(f, newPath);
})()"
```

### LEAF → BRANCH promotion (v11 §21)

```bash
obsidian eval vault=study code="
(async () => {
  const oldPath = 'projects/aws/AWS.ec2 - EC2.md';
  const newPath = 'projects/aws/AWS.EC2.ec2 - EC2.md';
  const f = app.vault.getAbstractFileByPath(oldPath);
  if (!f) return 'not found';
  // Update type to BRANCH before rename so frontmatter is consistent
  await app.fileManager.processFrontMatter(f, fm => {
    fm.type = 'BRANCH';
    if (!Array.isArray(fm.children)) fm.children = [];
  });
  await app.fileManager.renameFile(f, newPath);
})()"
```

### Move to a different folder

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.leaf-b - Leaf B.md');
  if (!f) return;
  // Ensure destination folder exists first
  const destFolder = 'projects/aws/ec2-family';
  if (!app.vault.getAbstractFileByPath(destFolder)) {
    await app.vault.createFolder(destFolder);
  }
  await app.fileManager.renameFile(f, destFolder + '/AWS.leaf-b - Leaf B.md');
})()"
```

### Anti-pattern

> [!warning] Do NOT do this
>
> ```bash
> # BAD: vault.rename moves the file but does NOT update wikilinks pointing to it
> obsidian eval vault=study code="
>   const f = app.vault.getAbstractFileByPath('projects/aws/AWS.leaf-a - Old Title.md');
>   await app.vault.rename(f, 'projects/aws/AWS.leaf-a - New Title.md');
> "
> ```
>
> Always use `app.fileManager.renameFile` — it triggers Obsidian's link-update pipeline.
> `app.vault.rename` is a raw filesystem move with no wikilink awareness.

---

## Pattern 5 — Delete a Note to Trash

Move a file or folder to the system trash (or the `.trash/` folder inside the vault)
via the Obsidian runtime. Never use shell `rm` — it bypasses link-update hooks.

### API

```
app.vault.trash(abstractFile, useSystemTrash)
```

- `useSystemTrash = true` → sends to macOS Trash (recoverable via Finder).
- `useSystemTrash = false` → moves to `.trash/` inside the vault (default for skills).
- Works on both `TFile` and `TFolder` (deletes folder with all contents).

### One-liner: trash a single note

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.old-note - Old Note.md');
  if (f) await app.vault.trash(f, false);
})()"
```

### Trash a folder and all its contents

```bash
obsidian eval vault=study code="
(async () => {
  const folder = app.vault.getAbstractFileByPath('projects/deprecated-project');
  if (folder) await app.vault.trash(folder, false);
})()"
```

### Conditional trash (only if a condition is met)

```bash
obsidian eval vault=study code="
(async () => {
  const f = app.vault.getAbstractFileByPath('projects/aws/AWS.leaf-c - Leaf C.md');
  if (!f) return 'not found';
  const fm = app.metadataCache.getFileCache(f)?.frontmatter ?? {};
  if (fm.status !== 'archived') return 'skipped — status is ' + fm.status;
  await app.vault.trash(f, false);
  return 'trashed';
})()"
```

### Anti-pattern

> [!warning] Do NOT do this
>
> ```bash
> # BAD: shell rm bypasses Obsidian's link-update pipeline and breaks wikilinks
> rm -f ~/vaults/study/projects/aws/AWS.old-note\ -\ Old\ Note.md
> ```
>
> Always use `app.vault.trash` — Obsidian updates backlink references and
> `.obsidian/` metadata entries; the shell knows nothing about these.

---

## Quick Reference

| Pattern           | API                                                         | Notes                                                    |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Read frontmatter  | `metadataCache.getFileCache(f)?.frontmatter`                | May be stale immediately after write                     |
| Update property   | `fileManager.processFrontMatter(f, fm => { fm.key = val })` | Atomic; handles YAML serialisation                       |
| Append to section | `vault.process(f, content => newContent)`                   | Atomic read-modify-write                                 |
| Move / rename     | `fileManager.renameFile(f, newPath)`                        | Updates all wikilinks automatically                      |
| Delete to trash   | `vault.trash(f, false)`                                     | Use `false` for vault `.trash/`; `true` for system trash |

> **See also**: `obsidian_docs.md` v11 §21 for the full LEAF → BRANCH promotion workflow
> which composes Patterns 2, 4 in sequence.

---

## Simple Operations — Direct CLI Commands

These commands are one-shot reads, writes, or queries that need no JavaScript closure.
Use them when a single step is sufficient. Use `obsidian eval` only when two or more
steps must execute atomically inside a single JS closure.

### Decision Boundary

> **Rule**: Use a direct command when the operation is a single read, write, or query
> with no dependent steps. Use `eval` when two or more steps must execute atomically
> in a single JS closure.

Examples that belong to direct commands:

- Read a note body → `obsidian read`
- Append a line to a note → `obsidian append`
- Search for a keyword → `obsidian search`

Examples that require `eval`:

- Read frontmatter **then** write back a modified field (two steps, must be atomic)
- Append a connection **then** append the inverse to the target (two notes, one transaction)
- Check existence **then** create only if absent (conditional create)

> [!warning] Anti-pattern: chaining direct commands as a substitute for eval
>
> ```bash
> # BAD: two shell calls are not atomic — the second can fail after the first succeeds
> obsidian read file="Source" | parse_connections
> obsidian append file="Target" content="- inverse :: [[Source]]"
> ```
>
> Use a single `eval` closure instead so both writes happen in the same JS event-loop tick.

---

### Quick-Reference Table

| Command        | Primary use case                                | Group      |
| -------------- | ----------------------------------------------- | ---------- |
| `read`         | Read a note's full Markdown body                | File I/O   |
| `create`       | Create a new note with optional initial content | File I/O   |
| `append`       | Append text to the end of an existing note      | File I/O   |
| `property:set` | Set a single frontmatter property by key        | File I/O   |
| `search`       | Full-text search across all vault notes         | Search     |
| `backlinks`    | List all notes that link to a given note        | Search     |
| `tags`         | List all tags used across the vault             | Search     |
| `files`        | List vault files with optional sort and limit   | Search     |
| `unresolved`   | List all unresolved wikilinks in the vault      | Search     |
| `daily:read`   | Read today's daily note body                    | Daily Note |
| `daily:append` | Append text to today's daily note               | Daily Note |
| `tasks`        | List open tasks (checkboxes) across the vault   | Daily Note |

---

### File I/O

#### `obsidian read`

Read the full Markdown body of a note.

```
obsidian read vault=<name> file="<note name or path>"
```

| Parameter | Required | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| `vault`   | yes      | Vault name                                      |
| `file`    | yes      | Wikilink-style note name or vault-relative path |

**Example**

```bash
obsidian read vault=study file="AWS.ROOT - Amazon Web Services"
```

**Example output** (truncated)

```
---
title: "Amazon Web Services"
type: ROOT
...
---

## Summary

Cloud infrastructure platform...
```

**When to use `eval` instead**: when you need to read frontmatter _and_ modify it
in the same operation — use `processFrontMatter` (Pattern 2) for atomic updates.

---

#### `obsidian create`

Create a new note with optional initial content. Exits 0 even if the note already exists
(idempotent by default).

```
obsidian create vault=<name> name="<note name>" [content="<body>"]
```

| Parameter | Required | Description                           |
| --------- | -------- | ------------------------------------- |
| `vault`   | yes      | Vault name                            |
| `name`    | yes      | Note name (no `.md` extension needed) |
| `content` | no       | Initial Markdown body                 |

**Example**

```bash
obsidian create vault=study name="AWS.vpc - VPC" content="## Summary\n\nVirtual network."
```

**When to use `eval` instead**: when creation must be conditional (check first, create only
if absent) or when you must also update a parent's `children` array atomically.

---

#### `obsidian append`

Append text to the end of an existing note.

```
obsidian append vault=<name> file="<note name>" content="<text>"
```

| Parameter | Required | Description              |
| --------- | -------- | ------------------------ |
| `vault`   | yes      | Vault name               |
| `file`    | yes      | Target note name or path |
| `content` | yes      | Text to append           |

**Example**

```bash
obsidian append vault=study file="AWS.ROOT - Amazon Web Services" \
  content="- See also: [[AWS.vpc - VPC]]"
```

**When to use `eval` instead**: when you need to append to a _specific named section_
(e.g. `## Connections`) rather than the end of the file — use `vault.process` (Pattern 3).

---

#### `obsidian property:set`

Set a single frontmatter property without touching the rest of the document.

```
obsidian property:set vault=<name> file="<note name>" key=<property> value=<value>
```

| Parameter | Required | Description                                  |
| --------- | -------- | -------------------------------------------- |
| `vault`   | yes      | Vault name                                   |
| `file`    | yes      | Target note name or path                     |
| `key`     | yes      | Frontmatter property name (no quotes needed) |
| `value`   | yes      | New value (string; wrap arrays in `eval`)    |

**Example**

```bash
obsidian property:set vault=study file="AWS.ec2 - EC2" key=status value=stable
```

**When to use `eval` instead**: when setting multiple properties at once (use
`processFrontMatter` with a single callback — Pattern 2) or when the value is a YAML array.

---

### Search & Query

#### `obsidian search`

Full-text search across all vault notes. Returns a list of matching note paths.

```
obsidian search vault=<name> query="<keyword or phrase>"
```

| Parameter | Required | Description                       |
| --------- | -------- | --------------------------------- |
| `vault`   | yes      | Vault name                        |
| `query`   | yes      | Search term (plain text or regex) |

**Example**

```bash
obsidian search vault=study query="VPC peering"
```

**Example output**

```
projects/aws/AWS.vpc - VPC.md
projects/aws/AWS.tgw - Transit Gateway.md
```

**When to use `eval` instead**: when you need to score or rank results by relevance,
or when you need frontmatter fields alongside the search results — use `context.sh`.

---

#### `obsidian backlinks`

List all notes that contain a wikilink pointing to a given note.

```
obsidian backlinks vault=<name> file="<note name>"
```

| Parameter | Required | Description              |
| --------- | -------- | ------------------------ |
| `vault`   | yes      | Vault name               |
| `file`    | yes      | Target note name or path |

**Example**

```bash
obsidian backlinks vault=study file="AWS.vpc - VPC"
```

**Example output**

```
projects/aws/AWS.ec2 - EC2.md
projects/aws/AWS.tgw - Transit Gateway.md
```

**When to use `eval` instead**: when you need to inspect the _content_ of each backlink
(e.g. extract the relationship type from the Connections section).

---

#### `obsidian tags`

List all tags used across the vault with occurrence counts.

```
obsidian tags vault=<name>
```

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `vault`   | yes      | Vault name  |

**Example**

```bash
obsidian tags vault=study
```

**Example output**

```
#concept  42
#service  18
#draft    11
```

**When to use `eval` instead**: never — tag listing is always a one-shot query.

---

#### `obsidian files`

List vault files with optional sort order and result limit.

```
obsidian files vault=<name> [sort=<field>] [limit=<n>]
```

| Parameter | Required | Description                                         |
| --------- | -------- | --------------------------------------------------- |
| `vault`   | yes      | Vault name                                          |
| `sort`    | no       | Sort field: `modified` (default), `created`, `name` |
| `limit`   | no       | Maximum number of results (default: all)            |

**Example**

```bash
obsidian files vault=study sort=modified limit=10
```

**Example output**

```
projects/aws/AWS.ec2 - EC2.md
projects/aws/AWS.vpc - VPC.md
...
```

**When to use `eval` instead**: when you need to filter by folder, frontmatter field,
or apply custom scoring — use `app.vault.getMarkdownFiles()` inside an eval closure.

---

#### `obsidian unresolved`

List all unresolved wikilinks (links to notes that do not exist) across the vault.

```
obsidian unresolved vault=<name>
```

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `vault`   | yes      | Vault name  |

**Example**

```bash
obsidian unresolved vault=study
```

**Example output**

```
[[AWS.lambda - Lambda]]  ← referenced in AWS.ec2 - EC2.md
[[AWS.rds - RDS]]        ← referenced in AWS.vpc - VPC.md
```

**When to use `eval` instead**: when you need to resolve each unresolved link's source
note(s) programmatically — use `app.metadataCache.unresolvedLinks` in an eval closure.

---

### Daily Note

#### `obsidian daily:read`

Read today's daily note body.

```
obsidian daily:read vault=<name>
```

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `vault`   | yes      | Vault name  |

**Example**

```bash
obsidian daily:read vault=study
```

**When to use `eval` instead**: when you need to parse specific sections of the daily note
or extract structured data from its body.

---

#### `obsidian daily:append`

Append text to today's daily note. Creates the daily note if it does not yet exist.

```
obsidian daily:append vault=<name> content="<text>"
```

| Parameter | Required | Description    |
| --------- | -------- | -------------- |
| `vault`   | yes      | Vault name     |
| `content` | yes      | Text to append |

**Example**

```bash
obsidian daily:append vault=study content="- weekly-review complete: 0 issues"
```

**When to use `eval` instead**: when you need to append to a _specific named section_
within the daily note rather than the end of the file.

---

#### `obsidian tasks`

List open tasks (unchecked `- [ ]` checkboxes) across the vault.

```
obsidian tasks vault=<name>
```

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `vault`   | yes      | Vault name  |

**Example**

```bash
obsidian tasks vault=study
```

**Example output**

```
- [ ] Review EC2 pricing model  (projects/aws/AWS.ec2 - EC2.md)
- [ ] Add VPC peering diagram   (projects/aws/AWS.vpc - VPC.md)
```

**When to use `eval` instead**: when you need to filter tasks by due date, tag, or
frontmatter field — use `app.vault.getMarkdownFiles()` with body parsing in an eval closure.

---

### Post-Registration Verification Checklist

After registering the Obsidian CLI skill, run each command against the test vault to
confirm exit 0:

1. `obsidian read vault=<name> file="<any note>"` — exits 0, prints note body
2. `obsidian search vault=<name> query="test"` — exits 0, prints matching paths (may be empty)
3. `obsidian backlinks vault=<name> file="<any note>"` — exits 0, prints backlink list
4. `obsidian tags vault=<name>` — exits 0, prints tag list
5. `obsidian unresolved vault=<name>` — exits 0, prints unresolved links (may be empty)
6. `obsidian files vault=<name> sort=modified limit=5` — exits 0, prints up to 5 paths
