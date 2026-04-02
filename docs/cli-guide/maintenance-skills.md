# Maintenance and sync skills

Audit, lint, sync, and orchestration skills that keep the vault consistent.
For: agent authors, the Auditor subagent, and operators running scheduled maintenance.

[← Back to CLI Guide](cli-guide-index.md)

---

## `cli-lint.sh`

Validate frontmatter completeness, structural rules, flag/tag hygiene, connection typing, breadcrumb presence, and limit thresholds.

```bash
cli-lint.sh <vault> [<folder>] [--json]
cli-lint.sh vault=<name> [<folder>] [--json]
```

**Detected violations**

| Rule                 | Description                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| `missing-field`      | Required field absent: `title`, `type`, `kind`, `spine`, `status`, `created`, `aliases` |
| `root-has-parent`    | ROOT note has non-empty `parent:`                                                       |
| `missing-parent`     | BRANCH or LEAF has no `parent:`                                                         |
| `empty-children`     | BRANCH has empty `children: []`                                                         |
| `spine-in-body`      | Spine tag used in note body                                                             |
| `legacy-flag-tag`    | `#flag/` tag found in body                                                              |
| `legacy-status-tag`  | `#status/` tag found in body                                                            |
| `untyped-connection` | Connection line in `## Connections` not matching `:: [[`                                |
| `connection-limit`   | Connection count > 7                                                                    |
| `missing-breadcrumb` | BRANCH or LEAF missing `## Breadcrumb`                                                  |
| `flag-limit`         | Callout flag count > 3                                                                  |

**Excludes** `tpl-*`, `_vocab*`, `_topk*`, `_ontology*`.

**Example**

```bash
cli-lint.sh study projects/aws
# Lint complete. 3 issues in 45 notes.
# [WARN] AWS.s3-overview - S3 Overview.md: missing-field: aliases

cli-lint.sh study projects/aws --json
# {"vault":"study","folder":"projects/aws","issues":[...],"count":3}
```

**Exit codes** — 0 always (findings on stdout); 1 on script-level error only.

---

## `cli-orphans.sh`

Detect orphaned, broken, and mismatched parent–child relationships.

```bash
cli-orphans.sh <vault> [--json] [--project <slug>]
```

**Orphan types**

| Type       | Condition                                            |
| ---------- | ---------------------------------------------------- |
| `ORPHAN`   | BRANCH/LEAF with no `parent:` field                  |
| `BROKEN`   | `parent:` wikilink resolves to no file               |
| `MISMATCH` | Note lists parent P but P doesn't list note as child |

**Example**

```bash
cli-orphans.sh study --project aws
# ORPHAN  AWS.forgotten-note - Forgotten Note.md
# BROKEN  AWS.draft-idea - Draft Idea.md  (parent: [[AWS.missing-branch]] not found)
```

---

## `cli-relations.sh`

Enumerate all typed connections in a project as a source→rel→target edge list and validate each type against `_ontology.<slug>.md`.

```bash
cli-relations.sh [vault=<name>] <slug> [--json]
```

**JSON output**

```json
{
  "edges": [
    {
      "source": "AWS.s3-overview - S3 Overview",
      "rel": "depends-on",
      "target": "AWS.iam-basics - IAM Basics",
      "context": ""
    }
  ],
  "summary": { "depends-on": 5, "part-of": 2 },
  "unknownTypes": ["refers-to"]
}
```

**Example**

```bash
cli-relations.sh vault=study aws --json | python3 -m json.tool
```

---

## `migrate.sh`

Apply bulk schema changes from a declarative JSON spec.
Supports `rename-rel`, `rename-spine`, `add-field`, and `promote` operations.

Post-migration verification runs `obsidian unresolved` and `obsidian tags`.
New unresolved links emit a warning (not a failure).
Verification is skipped in `--dry-run` mode.
Both commands fall back gracefully if the native CLI version lacks support.

```bash
migrate.sh <vault> <project_slug> <spec_file> [--dry-run]
migrate.sh vault=<name> ...
```

**Spec format**

```json
[
  { "op": "rename-rel", "from": "triggers", "to": "activates" },
  { "op": "rename-spine", "from": "aws", "to": "cloud" },
  { "op": "add-field", "field": "reviewed", "value": false, "filter": { "type": "LEAF" } },
  { "op": "promote", "note": "AWS.s3-draft - S3 Draft" }
]
```

**Supported operations**

| `op`           | Effect                                                             |
| -------------- | ------------------------------------------------------------------ |
| `rename-rel`   | Rename a relationship type in all `## Connections` lines           |
| `rename-spine` | Update `spine:` frontmatter field across all notes                 |
| `add-field`    | Add a new frontmatter field with a default value (filter optional) |
| `promote`      | Change a LEAF note to BRANCH                                       |

`--dry-run` prints planned changes without writing.

---

## `sync-topk.sh`

Append overflow log rows to `_topk.<slug>.md` for any note exceeding connection, callout-flag, or BRANCH-children limits.

```bash
sync-topk.sh <vault> <project_slug>
sync-topk.sh vault=<name> <project_slug>
```

**Thresholds**

| Field                    | Threshold |
| ------------------------ | --------- |
| `connections`            | > 7       |
| `callout-flags`          | > 3       |
| `children` (BRANCH only) | > 7       |

**Overflow log row format**

```text
| date | [[note]] | field | count | threshold |
```

**Example**

```bash
sync-topk.sh study aws
# sync-topk: 45 note(s) scanned, 2 overflow row(s) appended to _topk.aws.md
```

**Idempotency** — deduplicates by note+field; re-running adds no duplicate rows.
Updates `updated:` frontmatter date on every run.
Warns (but does not error) when the log reaches 200 rows.

---

## `sync-ontology.sh`

Synchronise the project's `_ontology.<slug>.md` relationship type table with the actual relations found across all notes.

```bash
sync-ontology.sh [vault=<name>] <slug> [--json]
```

**Example**

```bash
sync-ontology.sh vault=study aws
# sync-ontology: aws — 3 type(s) added, 0 removed
```

**Idempotency** — only appends new types; never removes existing rows.

---

## `sync-vocab.sh`

Synchronise `_vocab.<slug>.md` with terms collected from note titles and aliases.

```bash
sync-vocab.sh [vault=<name>] <slug> [--dry-run]
```

---

## `weekly-review.sh`

One-command orchestrator that runs all maintenance sub-commands in sequence, then appends a timestamped summary to today's daily note.

Includes native CLI diagnostics: `obsidian tags sort=count counts` (sub-command #8) and `obsidian unresolved` (#7).

```bash
weekly-review.sh <vault> [<project_slug>] [--json]
weekly-review.sh vault=<name> ...
```

**Sub-command sequence**

| #   | Sub-command                       | Purpose                              |
| --- | --------------------------------- | ------------------------------------ |
| 1   | `cli-lint.sh`                     | Frontmatter and structure violations |
| 2   | `cli-orphans.sh`                  | Broken parent–child relationships    |
| 3   | `cli-relations.sh`                | Unknown relation types               |
| 4   | `sync-ontology.sh`                | Missing inverse relationships        |
| 5   | `sync-vocab.sh`                   | Vocabulary synchronisation           |
| 6   | `sync-topk.sh`                    | Overflow threshold violations        |
| 7   | `obsidian unresolved`             | Unresolved wikilinks (native CLI)    |
| 8   | `obsidian tags sort=count counts` | Tag distribution summary             |

Exits 1 with the failing sub-command name on stderr when any sub-command fails.
Exits 0 when all pass; runtime < 30 s for a 100-note vault.

**JSON output** (`--json`)

```json
{
  "lint": { "issues": 3 },
  "orphans": { "issues": 1 },
  "relations": { "unknown": 0 },
  "ontology": { "missingInverses": 2 },
  "unresolved": 0,
  "tags": { "total": 47, "top": [{ "tag": "#concept", "count": 23 }] }
}
```

**Example**

```bash
weekly-review.sh study aws --json
# → JSON summary; daily note updated under ## Ontology Work Log
```

---

## `morning.sh`

Daily startup script run automatically via cron at 08:00 on weekdays.

```bash
# Cron entry (added by bootstrap-vault.sh):
0 8 * * 1-5 ~/.ontology-cli/core/morning.sh
```

**Sequence on startup:**

1. Open today's daily note (`obsidian daily`)
1. Append inbox backlog count (`obsidian daily:append`)
1. Copy recently modified files list to clipboard (`obsidian files sort=modified limit=10 --copy`)
1. Check for unresolved links (`obsidian unresolved`)
