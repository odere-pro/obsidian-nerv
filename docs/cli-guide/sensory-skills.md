# Sensory skills

Read-only retrieval skills that search, score, and assemble vault context.
For: the Researcher subagent and any agent that needs vault context before answering a question.

[← Back to CLI Guide](cli-guide-index.md)

---

## `context.sh`

Primary sensory skill: relevance-scored vault retrieval.
Returns the top N notes scored by a weighted multi-factor model.

```bash
context.sh <vault> "<query>" [<limit>]
context.sh vault=<name> "<query>" [<limit>]
```

**Scoring weights (per query term)**

| Factor              | Points                    |
| ------------------- | ------------------------- |
| Title match         | +10                       |
| Alias match         | +8                        |
| Kind match          | +5                        |
| Spine match         | +4                        |
| Tag match           | +3                        |
| Body term frequency | +1 per occurrence, cap +5 |

**Default limit** — 5 results.

**JSON output schema**

```json
{
  "query": "S3 lifecycle",
  "vault": "study",
  "results": [
    {
      "path": "projects/aws/AWS.s3-lifecycle - S3 Lifecycle Rules.md",
      "title": "S3 Lifecycle Rules",
      "type": "LEAF",
      "kind": "concept",
      "spine": "aws",
      "status": "evergreen",
      "parent": "[[AWS.s3-overview - S3 Overview]]",
      "children": [],
      "aliases": ["lifecycle policy"],
      "breadcrumb": "AWS.ROOT > AWS.s3-overview > AWS.s3-lifecycle",
      "summary": "S3 lifecycle rules transition objects between storage classes...",
      "content": "...(truncated at 2000 chars)...",
      "connections": [
        { "rel": "depends-on", "target": "AWS.iam-basics - IAM Basics", "context": "" }
      ]
    }
  ]
}
```

**Example**

```bash
context.sh study "S3 lifecycle" 3
# → JSON with top 3 results
```

Returns `{"results":[]}` with exit 0 when no notes match.
Never exits non-zero for empty results.
Runtime < 5 s for a 200-note vault.

---

## `get-entity.sh`

Deep single-note retrieval by exact or partial basename/alias match.

```bash
get-entity.sh <vault> "<search-term>"
get-entity.sh vault=<name> "<search-term>"
```

**JSON output schema**

```json
{
  "path": "projects/aws/AWS.s3-lifecycle - S3 Lifecycle Rules.md",
  "matchType": "basename",
  "frontmatter": { "title": "...", "type": "LEAF", "kind": "concept", "...": "..." },
  "sections": { "Summary": "...", "Content": "...", "Connections": "..." },
  "backlinks": [{ "path": "...", "title": "...", "type": "..." }],
  "outgoing": [{ "path": "...", "title": "...", "display": "..." }]
}
```

**Example**

```bash
get-entity.sh study "S3 Lifecycle Rules"
# → JSON with full entity detail
```

Exits 1 with a stderr message if no note matches the search term.

---

## `get-tree.sh`

Return the complete hierarchical note tree for a project as nested JSON.
Traverse ROOT → BRANCH → LEAF via `children:` frontmatter arrays.

```bash
get-tree.sh <vault> <project_slug> [--depth <N>]
get-tree.sh vault=<name> <project_slug> [--depth <N>]
```

**JSON output schema**

```json
{
  "folder": "projects/aws",
  "nodeCount": 47,
  "tree": [
    {
      "path": "projects/aws/AWS.ROOT - Amazon Web Services.md",
      "title": "Amazon Web Services",
      "type": "ROOT",
      "kind": "concept",
      "status": "evergreen",
      "subtree": [
        {
          "path": "projects/aws/AWS.s3-overview - S3 Overview.md",
          "type": "BRANCH",
          "subtree": [{ "path": "...", "type": "LEAF", "subtree": [] }]
        },
        { "missing": "AWS.unresolved-ref" },
        { "cycle": "projects/aws/AWS.ROOT - Amazon Web Services.md" }
      ]
    }
  ]
}
```

`--depth N` limits recursion depth (default: unlimited, hard cap 50).

**Special nodes:**

- `{"missing":"<basename>"}` — child wikilink resolves to no file
- `{"cycle":"<path>"}` — child points back to an ancestor (prevents infinite recursion)

**Example**

```bash
get-tree.sh study aws --depth 2
```

---

## `get-knowledge-gap.sh`

Identify structural deficiencies across a project: stubs, isolated nodes, drafts, missing fields, low link counts, and unresolved links.

Uses `obsidian unresolved` as a pre-check before the main eval pass.
When the count is 0, the per-note wikilink resolution loop is skipped entirely — O(1) for healthy vaults instead of O(n×links).
Falls back to the eval-based approach if the native command is unavailable.

```bash
get-knowledge-gap.sh <vault> <project_slug>
get-knowledge-gap.sh vault=<name> <project_slug>
```

**JSON output schema**

```json
{
  "stubs": [{ "note": "...", "words": 42 }],
  "noConnections": ["..."],
  "drafts": [{ "note": "...", "kind": "concept", "spine": "aws" }],
  "missingFields": [{ "note": "...", "missing": ["kind", "spine"] }],
  "lowLinkCount": [{ "note": "...", "links": 1 }],
  "unresolvedLinks": [{ "note": "...", "broken": ["[[BadRef]]"] }]
}
```

**Definitions:**

- **Stubs** — notes with body word count < 100 (excluding frontmatter)
- **Low link count** — ROOT or BRANCH with < 2 outgoing links

---

## `explain-topic.sh`

Assemble a teaching bundle for a queried topic: primary note, parent, siblings, and connected notes' summaries.

```bash
explain-topic.sh <vault> <project_slug> "<topic>"
explain-topic.sh vault=<name> <project_slug> "<topic>"
```

**JSON output schema**

```json
{
  "primary": { "title": "...", "summary": "...", "...": "..." },
  "parent": { "title": "...", "summary": "..." },
  "siblings": [{ "title": "...", "summary": "..." }],
  "connected": [{ "title": "...", "summary": "...", "kind": "...", "rel": "..." }]
}
```
