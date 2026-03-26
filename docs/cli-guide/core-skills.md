# Core skills

CRUD motor skills that create and modify vault content.
For: agent authors and developers invoking skills from Claude Code sessions.

[← Back to CLI Guide](cli-guide-index.md)

---

## `create-project.sh`

Scaffold a complete project: ROOT note, `_ontology`, `_vocab`, `_topk`, and `.base` file.

```bash
create-project.sh <vault> <slug> "<Title>"
create-project.sh vault=<name> <slug> "<Title>"
```

**Parameters**

| Parameter | Description                                           |
| --------- | ----------------------------------------------------- |
| `vault`   | Vault name or `vault=<name>` keyword arg              |
| `slug`    | Project slug: lowercase alphanumeric, hyphens allowed |
| `Title`   | Human-readable project title                          |

**Creates (5 files)**

```text
projects/<slug>/
  <SLUG>.ROOT - <Title>.md      type: ROOT, kind: concept, status: draft
  _ontology.<slug>.md           10-row default relationship type table
  _vocab.<slug>.md              vocabulary tracking table
  _topk.<slug>.md               overflow log scaffold
  <slug>.base                   Bases filter: file.inFolder("projects/<slug>")
```

**Example**

```bash
create-project.sh study aws "Amazon Web Services"
# → Created projects/aws/ with 5 files
```

**Idempotency** — exits 0 with no modifications if `projects/<slug>/` already exists.

---

## `create-entity.sh`

Create a single typed note (LEAF, BRANCH, or ROOT) from the correct template, wire it into the parent's `children:` array, and log creation to the daily note.

```bash
create-entity.sh <vault> <project> <TYPE> <slug> "<Title>" <parent_slug> <kind> [<spine>] [--json]
create-entity.sh vault=<name> ...
```

**Parameters**

| Parameter     | Description                                            |
| ------------- | ------------------------------------------------------ |
| `TYPE`        | `LEAF`, `BRANCH`, or `ROOT`                            |
| `slug`        | Note slug within the project (lowercase, hyphens)      |
| `parent_slug` | Slug of the parent note (use `ROOT` for top-level)     |
| `kind`        | Knowledge kind: `concept`, `service`, `decision`, etc. |
| `spine`       | Optional; inherited from parent when omitted           |
| `--json`      | Emit `{"created":bool,"path":"...","title":"..."}`     |

**Example**

```bash
create-entity.sh study aws LEAF s3-overview "S3 Overview" ROOT concept aws
# → Created projects/aws/AWS.s3-overview - S3 Overview.md
# → Updated AWS.ROOT - Amazon Web Services.md children:[]
```

**Idempotency** — exits 0 with no modification if the note already exists.
On partial failure (note created, parent update fails) writes to `_inbox/_rollback-log.md`.

---

## `add-connection.sh`

Add a typed connection to a source note's `## Connections` section and write the inverse on the target note automatically.

```bash
add-connection.sh <vault> "<source-path>" "<rel-type>" "<target-path>" ["<context>"]
add-connection.sh vault=<name> ...
```

**Parameters**

| Parameter     | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `source-path` | Vault-relative path to the source note                     |
| `rel-type`    | Relationship type from the project's `_ontology.<slug>.md` |
| `target-path` | Vault-relative path to the target note                     |
| `context`     | Optional free-text context appended after `—`              |

**Example**

```bash
add-connection.sh study \
  "projects/aws/AWS.s3-overview - S3 Overview.md" \
  "depends-on" \
  "projects/aws/AWS.iam-basics - IAM Basics.md"
# Source gets: - depends-on :: [[AWS.iam-basics - IAM Basics]]
# Target gets: - dependency-of :: [[AWS.s3-overview - S3 Overview]]
```

**Idempotency** — checks for exact duplicate before appending; skips if already present.

---

## `import-json.sh`

Bulk-create notes from a JSON array, skipping notes that already exist.

```bash
import-json.sh <vault|vault=name> <project_slug> <json_file> <template>
```

**JSON format**

```json
[
  { "name": "EC2 Instances", "type": "LEAF", "kind": "concept", "spine": "aws" },
  { "name": "VPC Networking", "type": "BRANCH", "kind": "concept", "spine": "aws" }
]
```

Standard fields: `name`, `type`, `kind`, `spine`.
All extra fields are written verbatim as frontmatter properties.

**Example**

```bash
import-json.sh study aws notes.json LEAF
# → Created: 12, Skipped: 3
```

**Idempotency** — notes that already exist are silently skipped.
