---
title: 'Implement import-json.sh and document CRUD patterns'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-002 — Motor Skills: CRUD Operations'
planKey: 'STORY-008'
phase: 2
sequence: 4
parallelTrack: A
size: 'M — ~0.5 day'
dependsOn:
  - STORY-003
  - STORY-005
blocks:
  - STORY-023
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 008 acceptance criteria'
---

## Goal

Author `import-json.sh` in `~/.ontology-cli/core/` for bulk note creation from a JSON array, and document the canonical `obsidian eval` patterns for reading frontmatter as JSON, updating single properties, appending to named sections, moving notes with link-update, and deleting to trash in `~/.ontology-cli/core/PATTERNS.md`.

## Acceptance Criteria

- [ ] `import-json.sh study testproj /tmp/notes.json tpl-leaf` where `notes.json` is `[{"name":"TestImport","kind":"concept","spine":"test","type":"LEAF"}]` creates `TESTPROJ.testimport - TestImport.md` with correct frontmatter
- [ ] Extra JSON properties beyond the standard schema are passed through to frontmatter via `processFrontMatter`
- [ ] Skips existing notes without error; reports `Created: N, Skipped: M` on completion (idempotent)
- [ ] `PATTERNS.md` documents and provides verified test invocations for all 5 patterns: read frontmatter as JSON, update single property, append to named section, move note, delete to trash
- [ ] `import-json.sh` uses `python3 -c "import json,sys; ..."` for JSON parsing — zero `npm`/`pip` installs
- [ ] The move pattern documents that `app.fileManager.renameFile` updates all internal wikilinks automatically
- [ ] `tests/test-import-json.sh` passes in the test harness

## Additional Information

`PATTERNS.md` serves as the internal reference for all skill authors (STORY-009 through STORY-024) and the agent layer (STORY-021). The 5 canonical patterns are the low-level primitives that all higher-level skills compose.

> [!important]
> The move pattern (`app.fileManager.renameFile`) is critical for LEAF → BRANCH promotion per v11 §21 — document that it updates all internal wikilinks automatically and is therefore preferred over `app.vault.rename`.

## System Design

- [PLAN.md — Story 008](../PLAN.md)
- [obsidian_docs.md — v11 §21 Promotion workflow, CRUD primitives](../obsidian_docs.md)

## Resources

- [`python3 -c "import json,sys"` for JSON parsing](https://docs.python.org/3/library/json.html): `python3 -c "import json,sys; data=json.load(sys.stdin); ..."` reads JSON from stdin; `json.dumps(obj)` serializes back; zero dependencies beyond Python 3.x which is macOS built-in
- [Obsidian `app.fileManager.renameFile(file, newPath)`](https://docs.obsidian.md/Reference/TypeScript+API/FileManager/renameFile): renames/moves a file and updates all wikilinks pointing to it; requires the destination directory to already exist
- [Obsidian `app.metadataCache.getFileCache(file)?.frontmatter`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache): returns parsed frontmatter as a plain JS object; note that the cache may be stale immediately after a write — add a brief `await` or re-read via `vault.cachedRead` to ensure freshness

## Recommendations

- Parse the entire JSON array into a shell variable with `python3` once at script start, then iterate with a for loop — avoids spawning a Python process per note
- `PATTERNS.md` should include runnable `obsidian eval` one-liners so developers can copy-paste into a terminal for quick validation
- Each pattern in `PATTERNS.md` should include an anti-pattern box: what NOT to do (e.g., "Do not use `app.vault.read` + manual YAML parse — use `getFileCache` instead")

## Security Considerations

| Area                 | Risk                                                                              | Mitigation                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shell injection      | JSON field values interpolated into shell commands or `obsidian eval` expressions | Serialize all JSON values through `python3 -c "import json; print(json.dumps(val))"` before passing to `eval` to ensure proper escaping |
| Arbitrary file write | `import-json.sh` creates files in the vault from external JSON                    | Validate that all generated paths are within `$VAULT_PATH/projects/$SLUG/` before calling `vault.create`                                |

---

> **Blocks**:
>
> - STORY-023 ⛔ — Implement dev-specific skills (CRUD patterns referenced by adr.sh and code-link.sh)
