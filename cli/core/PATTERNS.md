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
