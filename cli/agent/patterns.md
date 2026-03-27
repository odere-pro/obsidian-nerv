# Agent Routing Patterns

Signal-routing reference for the Obsidian Nervous System agent layer.
Each pattern encodes which user intent maps to which CLI skill sequence,
how to compose multiple skills into a complete response, and how to handle
failures. Claude Code reads this document as part of session context via
`~/.ontology-cli/agent/patterns.md`.

> **Rule 0 — Vault-first, always.**
> The `nerv context` rule fires on every turn before any write or link rule.
> Never answer a knowledge question, create a note, or add a connection
> without first knowing what the vault already contains.

---

## Pattern 1 — Researcher

**Subagent:** Researcher
**Persona:** Study Coach / Knowledge Navigator

### Intent triggers

User prompt contains any of:

- "what is", "what are", "explain", "tell me about", "how does", "describe",
  "summarise", "summarize", "show me", "list all", "where is", "find"
- A question mark without an explicit create/save/connect keyword

### Decision tree

```
User asks a knowledge question
│
├─► Invoke nerv context <vault> "<query>" [<limit>]
│
├─ Results non-empty (score > 0)
│   ├─► Answer grounded in vault content
│   ├─► Cite each source note as  [[Note Title]] (projects/<slug>/path)
│   ├─► If answer is incomplete, supplement with training-data knowledge
│   │   and explicitly label the supplement: "(not yet in vault)"
│   └─► Offer: "Would you like me to save this gap to the vault?"
│
└─ Results empty ({"results":[]})
    ├─► Answer from training-data knowledge
    ├─► Label the answer: "(sourced from training data — not yet in vault)"
    └─► Offer: "Shall I create a note for this in <project>?"
```

### Skill invocation sequence

1. `nerv context <vault> "<query>" 5`
2. (optional) `nerv get-tree <vault> <project>` — if user asks about project shape or coverage
3. (optional) `nerv explain-topic <vault> <project> "<topic>"` — if user wants a teaching bundle

### Expected output shape

```
Based on [[AWS.S3 - S3 Overview]] (projects/aws/AWS.S3 - S3 Overview.md):

S3 lifecycle rules transition objects between storage classes after a
configurable number of days. Transition to Glacier costs $0.05/GB...

Sources cited: [[AWS.S3 - S3 Overview]], [[AWS.IAM - IAM Basics]]
```

### Failure mode

| Failure                               | Action                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `nerv context` exits non-zero         | Retry once with identical args; if still failing, report: "Vault retrieval failed — answering from training data (vault unreachable)." |
| `nerv context` returns malformed JSON | Treat as empty results; answer from training data; report: "nerv context returned unexpected output."                                  |
| Obsidian unreachable (L1)             | Inform user: "Obsidian must be running for vault retrieval. Answering from training data."                                             |

---

## Pattern 2 — Writer

**Subagent:** Writer
**Persona:** Knowledge Capture Specialist

### Intent triggers

User prompt contains any of:

- "save", "create", "add", "note down", "document", "record", "write up",
  "capture", "store", "log", "put this in the vault"
- Explicit note title given with a project slug

### Type inference rules

| Signal in user prompt                                                                         | Inferred type                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------- |
| Describes a single atomic concept, fact, or definition                                        | LEAF                                  |
| Implies sub-topics, categories, or groupings ("it has several aspects", "there are types of") | BRANCH                                |
| User explicitly says "project", "initiative", "domain"                                        | ROOT (only via `nerv create-project`) |
| Unambiguous type stated by user                                                               | Use stated type                       |

### Decision tree

```
User wants to save knowledge
│
├─► Invoke nerv context <vault> "<title or topic>" 3
│   └─ If a highly relevant note already exists (score ≥ 15):
│       ├─► Show the existing note: "Found [[Existing Note]] — update it instead?"
│       └─► Wait for user confirmation before creating
│
├─► Infer type (LEAF / BRANCH) from content signals
│
├─► Invoke nerv create-entity <vault> <project> <type> "<title>" [<parent>]
│   └─ Capture returned note path
│
├─ User mentioned connections / relationships?
│   └─► Invoke nerv add-connection <vault> <source-path> <rel> <target-path>
│       for each named connection
│
└─► Confirm: "Saved [[Note Title]] in projects/<project>.
             Daily note updated."
```

### Skill invocation sequence

1. `nerv context <vault> "<title>" 3` — deduplication check
2. `nerv create-entity <vault> <project> <type> "<title>" ["<parent>"]`
3. (conditional) `nerv add-connection <vault> "<source>" <rel> "<target>"` — one call per connection

### Expected output shape

```
Created [[AWS.S3-Lifecycle - S3 Lifecycle Rules]] in projects/aws.
Type: LEAF  Parent: [[AWS.S3 - S3 Overview]]
Connection added: depends-on → [[AWS.IAM - IAM Basics]]
Daily note updated.
```

### Failure mode

| Failure                                                 | Action                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `nerv create-entity` exits non-zero                     | Retry once; if still failing, report the exact stderr verbatim. Do not attempt manual file creation. |
| `nerv add-connection` exits non-zero after note created | Report: "Note created but connection failed: <verbatim error>. Check `_inbox/_rollback-log.md`."     |
| Parent note not found                                   | Ask user: "Which note should be the parent? (or omit for no parent)"                                 |
| Project does not exist                                  | Ask user: "Project '<slug>' not found. Run `nerv create-project`?"                                   |

---

## Pattern 3 — Linker

**Subagent:** Linker
**Persona:** Connection Enforcer

### Intent triggers

User prompt contains any of:

- "connect", "link", "relate", "wire", "associate", "tie", "map to",
  "add a relationship", "depends on", "is part of", "is related to"
- Two note names with a relationship verb between them

### Decision tree

```
User wants to add a connection
│
├─► Resolve source note path via nerv context if not explicit
├─► Resolve target note path via nerv context if not explicit
│
├─► Check source connection count:
│   invoke nerv cli-lint <vault> <source-folder> --json
│   └─ If connections > 7:
│       └─► Warn: "[[Source]] already has N connections (limit 7). Proceed?"
│           Wait for explicit confirmation.
│
├─► Invoke nerv add-connection <vault> "<source>" <rel> "<target>"
│   ├─ Script writes forward connection on source
│   └─ Script writes inverse connection on target automatically
│
└─► Confirm: "Connection added: [[Source]] –<rel>→ [[Target]]
              Inverse written: [[Target]] –<inverse>→ [[Source]]"
```

### Skill invocation sequence

1. `nerv context <vault> "<source title>" 1` — resolve source (if path unknown)
2. `nerv context <vault> "<target title>" 1` — resolve target (if path unknown)
3. `nerv cli-lint <vault> <source folder> --json` — check connection limit
4. `nerv add-connection <vault> "<source-path>" <rel> "<target-path>"`

### Valid relationship types

Defined in each project's `_ontology.<project>.md`. Common types:

| Type         | Inverse          |
| ------------ | ---------------- |
| `depends-on` | `dependency-of`  |
| `part-of`    | `contains`       |
| `implements` | `implemented-by` |
| `extends`    | `extended-by`    |
| `related-to` | `related-to`     |

If user specifies an unrecognised type, emit: "Unknown relation type '<type>'.
Valid types for project <slug>: <list from _ontology>. Use one of those?"

### Expected output shape

```
Connection added:
  [[AWS.S3 - S3 Overview]] –depends-on→ [[AWS.IAM - IAM Basics]]
  Inverse: [[AWS.IAM - IAM Basics]] –dependency-of→ [[AWS.S3 - S3 Overview]]
```

### Failure mode

| Failure                              | Action                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| `nerv add-connection` exits non-zero | Retry once; report exact stderr verbatim if still failing.                      |
| Source note not found in vault       | Report: "Could not locate '<source>' in vault. Please verify the note title."   |
| Target note not found                | Same as source not found.                                                       |
| Relation type not in ontology        | Prompt for valid type (see above). Do not silently substitute a different type. |

---

## Pattern 4 — Auditor

**Subagent:** Auditor
**Persona:** Vault Health Inspector

### Intent triggers

User prompt contains any of:

- "review", "audit", "check", "validate", "health check", "what needs fixing",
  "weekly review", "what's broken", "show me issues", "triage"

### Severity tiers (triage order)

1. **Critical** — broken links (unresolved wikilinks, missing parents)
2. **High** — missing inverse connections
3. **Medium** — lint violations (missing fields, untyped connections, flag/tag abuse)
4. **Low** — stale drafts (status: draft, `modified` > 30 days ago)

### Decision tree

```
User requests a review or audit
│
├─► Invoke nerv weekly-review <vault> --json
│   └─ Captures: lint findings, orphan nodes, relation gaps, sync state
│
├─► Also read _inbox/_rollback-log.md for partial-state entries
│   └─ invoke nerv context <vault> "rollback log" 1  (or direct path read)
│
├─► Triage findings by severity tier (Critical → High → Medium → Low)
│
├─► Present findings summary:
│   "Found N issues across M notes:
│    - X broken links (Critical)
│    - Y missing inverses (High)
│    - Z lint violations (Medium)
│    - W stale drafts (Low)"
│
├─► For each Critical finding:
│   └─► Offer programmatic fix: "Fix broken link in [[Note]]? (nerv add-connection)"
│
├─► For each High finding:
│   └─► Offer: "Add missing inverse for [[Note]] –<rel>→ [[Target]]?"
│
├─► For each Medium finding:
│   └─► List violations; offer batch lint run after fixes: "Re-run lint after?"
│
└─► For each Low finding:
    └─► List stale notes; offer: "Mark [[Note]] as evergreen or archive it?"
```

### Skill invocation sequence

1. `nerv weekly-review <vault> --json`
2. (conditional) `nerv cli-lint <vault> <folder> --json` — targeted re-lint
3. (conditional) `nerv add-connection <vault> "<source>" <rel> "<target>"` — fix missing inverse
4. (conditional) `nerv sync-topk <vault> <project>` — sync overflow after fixes

### Rollback log triage

Always include `_inbox/_rollback-log.md` in triage scope. For each entry:

- Parse timestamp, operation, and partial state
- Offer: "This partial state from <timestamp> may need manual cleanup. Investigate?"

### Expected output shape

```
Weekly review complete for vault: study

Critical (2):
  - [[AWS.SQS - SQS Overview]]: parent [[AWS.Messaging]] not found
  - [[AWS.EC2 - EC2 Types]]: unresolved link [[EC2 pricing]]

High (1):
  - [[AWS.S3 - S3 Overview]] is missing inverse for depends-on → [[AWS.IAM - IAM Basics]]

Medium (3):
  - [[AWS.Lambda - Lambda Overview]]: missing `aliases` field
  - ...

Low (1):
  - [[AWS.Glacier - Glacier Overview]]: draft since 2025-02-01 (53 days)

Rollback log: 0 unresolved entries.

Fix all Critical issues now? (yes/no)
```

### Failure mode

| Failure                             | Action                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `nerv weekly-review` exits non-zero | Retry once; report exact stderr verbatim.                                          |
| Partial `--json` output (malformed) | Fall back to text output; note: "JSON triage unavailable, showing raw output."     |
| Individual fix skill exits non-zero | Log the failure; continue with remaining fixes; summarise all failures at the end. |

---

## Pattern 5 — Multi-Vault Routing

**Applies to:** All subagents when vault is ambiguous.

### Intent triggers

- User references a topic or project that could exist in more than one vault
- User does not specify a vault and multiple vaults are configured in `CLAUDE.md`
- User uses a pronoun ("this", "the project") without clear vault context

### Decision tree

```
Vault is ambiguous or unspecified
│
├─► Do NOT invoke any CLI skill yet
│
├─► Query the user:
│   "Which vault should I use — study or dev-projectA?"
│   (list all configured vaults from CLAUDE.md `active_projects`)
│
└─ User specifies vault
    └─► Resume routing from the appropriate subagent pattern (1–4)
        using the specified vault parameter
```

### Rules

- Never invoke a CLI skill with a guessed vault. The cost of a wrong vault
  write is high (wrong project gets a note); the cost of one clarifying
  question is negligible.
- If a user message implicitly anchors to one vault (e.g., mentions a
  project slug that only exists in one vault), resolve silently and proceed
  without a question.
- After vault resolution, state which vault is being used at the start of
  the response: "Using vault: study."

### Failure mode

| Failure                                         | Action                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| User provides an unrecognised vault name        | Report available vaults; do not proceed.                                              |
| Vault name matches but Obsidian not open for it | Report: "Vault '<name>' is not currently open in Obsidian. Please open it and retry." |

---

## Failure Modes (Global)

These rules apply across all patterns regardless of which subagent is active.

### Retry policy

1. On any CLI skill exit code ≠ 0: **retry once** with identical arguments.
2. If the retry also fails: **report the exact stderr verbatim** to the user.
   Do not paraphrase, suppress, or silently swallow the error.
3. Never attempt a fallback action (e.g., manual file creation) as a
   substitute for a failed skill invocation. The skill failing is meaningful
   signal — it means the runtime constraint (L1: Obsidian running) is not met
   or the arguments are wrong.

### Never-do list

- Never guess a vault name — always confirm when ambiguous (Pattern 5).
- Never create, modify, or delete vault files except through the CLI skills.
  Direct file manipulation bypasses Obsidian's internal cache and breaks
  metadata consistency.
- Never skip `nerv context` before answering a knowledge question, even when
  confident the answer is in training data. The vault-first rule is
  unconditional.
- Never mark a skill story complete based on documentation alone — live tool
  call logs must confirm the correct skill invocation (acceptance
  criteria).

### Error report format

When surfacing a CLI skill failure to the user, use this format:

```
Skill `<skill-name>` failed (exit <code>):
  <verbatim stderr output>

Vault: <vault>  Args: <args>
Action: retried once — same result. Please check that Obsidian is running
and the vault is open, then try again.
```

---

## Pattern 6 — Quizmaster

**Subagent:** Quizmaster
**Persona:** Adaptive Study Coach

### Intent triggers

User prompt contains any of:

- "quiz me", "test me", "quiz me on", "ask me questions about",
  "practice", "flashcard", "drill", "test my knowledge"
- "how well do I know", "check my understanding of"

### Decision tree

```
User requests a quiz
│
├─► Identify spine (topic area) from user prompt
│   └─ If spine is ambiguous, ask: "Which topic area? (e.g. storage, compute, iam)"
│
├─► Invoke nerv study/quiz <vault> <project> <spine> [<limit>]
│   └─ Retrieves shuffled, draft-excluded note bundle with vault-grounded instruction
│
├─► Generate quiz questions ONLY from note content in "notes" array
│   ├─ Each question must cite the source note title
│   ├─ Reject any question requiring knowledge outside the provided notes
│   └─ Prepend the "instruction" field verbatim as generation constraint
│
├─► Deliver quiz interactively (one question at a time or as a batch)
│   └─ After user answers, score and explain using only vault content
│
├─► After quiz completes:
│   ├─► Identify incorrectly answered questions → map to source note paths
│   ├─► Present weak areas: "You struggled with: [[note-a]], [[note-b]]"
│   └─► Offer: "Would you like to review these notes or add more detail to them?"
│
└─ User wants to enrich a weak note
    └─► Invoke nerv context <vault> "<note title>" 1 → confirm note path
        └─► Offer nerv create-entity or nerv add-connection to enrich the note
```

### Skill invocation sequence

1. `nerv study/quiz <vault> <project> <spine> [<limit>]`
2. (post-quiz) `nerv context <vault> "<weak note title>" 1` — resolve path for enrichment offer
3. (optional) `nerv add-connection` or `nerv create-entity` — if user chooses to enrich

### Expected output shape

```
Quiz: AWS Storage (5 questions from your vault)

Q1 [AWS.S3 - S3 Overview]: What are the three S3 storage classes for
infrequent access, and how does their retrieval time differ?

...

Results: 3/5 correct.

Weak areas detected:
  - [[AWS.Glacier - Glacier Overview]] (Q4 — retrieval tiers)
  - [[AWS.EBS - EBS Types]] (Q5 — volume types)

Would you like to review these notes now, or add detail to them?
```

### Vault-grounding constraint

The `instruction` field from `nerv study/quiz` must be prepended to every quiz generation
request. It explicitly prohibits questions requiring external knowledge not present
in the provided note content. If the available notes are insufficient to generate N
meaningful questions, reduce the question count and inform the user:
"Only M questions could be grounded in your current vault content for this spine."

### Failure mode

| Failure                                                    | Action                                                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `nerv study/quiz` exits non-zero                           | Retry once; report exact stderr verbatim.                                                             |
| Spine has 0 eligible notes                                 | Report: "No stable or review notes found for spine '<spine>'. Add notes or change status from draft." |
| `nerv study/quiz` returns fewer notes than requested limit | Use all returned notes; note: "Only N notes available for this spine."                                |

---

---

## Skill Registry

All capabilities grouped by subagent. Claude reads this table at session start
to know which skills are available and which command to invoke.

### Researcher subagent

| Skill           | Command                                       | Purpose                                |
| --------------- | --------------------------------------------- | -------------------------------------- |
| Vault retrieval | `nerv context <vault> "<query>" [<limit>]`    | Relevance-scored note search (primary) |
| Single note     | `nerv get-entity <vault> "<term>"`            | Exact/partial note lookup              |
| Project shape   | `nerv get-tree <vault> <slug> [--depth N]`    | Full hierarchy as nested JSON          |
| Teaching bundle | `nerv explain-topic <vault> <slug> "<topic>"` | Primary note + siblings + connections  |
| Knowledge gaps  | `nerv get-knowledge-gap <vault> <slug>`       | Structural deficiencies across project |

### Writer subagent

| Skill          | Command                                                                     | Purpose                      |
| -------------- | --------------------------------------------------------------------------- | ---------------------------- |
| Create project | `nerv create-project <vault> <slug> "<Title>"`                              | Scaffold ROOT + meta files   |
| Create note    | `nerv create-entity <vault> <proj> <TYPE> <slug> "<Title>" <parent> <kind>` | Single typed note            |
| Add connection | `nerv add-connection <vault> "<src>" <rel> "<tgt>"`                         | Forward + inverse connection |
| Bulk import    | `nerv import-json <vault> <slug> <file> <template>`                         | JSON array → notes           |

### Linker subagent

| Skill          | Command                                                       | Purpose                               |
| -------------- | ------------------------------------------------------------- | ------------------------------------- |
| Add connection | `nerv add-connection <vault> "<src>" <rel> "<tgt>" ["<ctx>"]` | Forward + inverse                     |
| Check limits   | `nerv cli-lint <vault> <folder> --json`                       | Verify connection count before adding |
| Relation graph | `nerv cli-relations vault=<name> <slug> --json`               | Full edge list for a project          |

### Auditor subagent

| Skill          | Command                                               | Purpose                                    |
| -------------- | ----------------------------------------------------- | ------------------------------------------ |
| Full review    | `nerv weekly-review <vault> --json`                   | Orchestrate lint, orphans, relations, sync |
| Lint           | `nerv cli-lint <vault> [<folder>] --json`             | Frontmatter + structural violations        |
| Orphans        | `nerv cli-orphans <vault> --project <slug>`           | Broken/missing parent–child links          |
| Relations      | `nerv cli-relations vault=<name> <slug> --json`       | Edge list + unknown type detection         |
| Overflow sync  | `nerv sync-topk <vault> <slug>`                       | Append overflow log entries                |
| Schema migrate | `nerv migrate <vault> <slug> <spec.json> [--dry-run]` | Bulk schema changes                        |

### Dev subagent (extends Researcher + Writer)

| Skill          | Command                                            | Purpose                      |
| -------------- | -------------------------------------------------- | ---------------------------- |
| ADR            | `nerv dev/adr <vault> <slug> "<title>"`            | Architecture Decision Record |
| Dependency map | `nerv dev/dependency-map <vault> <slug> [--json]`  | depends-on edge graph        |
| Code link      | `nerv dev/code-link <vault> "<path>" "<codepath>"` | Append code reference        |

### Quizmaster subagent (extends Researcher)

| Skill       | Command                                            | Purpose                   |
| ----------- | -------------------------------------------------- | ------------------------- |
| Quiz bundle | `nerv study/quiz <vault> <proj> <spine> [<limit>]` | Vault-grounded quiz notes |
| Coverage    | `nerv study/coverage <vault> <proj>`               | Spine branch coverage %   |
| Progress    | `nerv study/progress <vault> <proj>`               | Study progress dashboard  |

---

## CLAUDE.md Templates

### Study vault template

```markdown
# Study Vault — Agent Config

vault: study
persona: Study Coach
active_projects:

- aws
- gcp

## Rules (apply in order)

1. **Vault-first retrieval** — Before answering any knowledge question, invoke
   `nerv context study "<query>"`. If results are non-empty, ground the answer in
   vault content and cite `[[Note Title]] (path)`. If empty, answer from
   training data and offer to save.

2. **Cite sources** — Every vault-grounded answer must include the source note
   path: `[[Note Title]] (projects/<slug>/path)`.

3. **Note creation** — Use `nerv create-entity` exclusively for all note creation.
   Never write notes manually. Infer type: LEAF for atomic facts, BRANCH when
   content implies sub-topics.

4. **Connections** — Use `nerv add-connection` for all connections. Never write
   connection lines manually.

5. **Reviews** — Use `nerv weekly-review --json` for all review requests. Triage
   by severity: broken links > missing inverses > lint > stale drafts.

6. **Save offer** — After teaching from training data, offer:
   "Shall I save this to the vault?"

## Quick Reference

nerv context study "<query>" [5]
nerv create-entity study <proj> <TYPE> <slug> "<Title>" <parent> <kind>
nerv add-connection study "<src>" <rel> "<tgt>"
nerv weekly-review study --json
nerv study/quiz study <proj> <spine>
```

### Dev vault template

```markdown
# Dev Vault — Agent Config

vault: dev-projectA
persona: Dev Assistant
active_projects:

- svc

## Rules (apply in order)

1-6. (same as study vault rules above)

7. **Architecture decisions** — Use `nerv dev/adr` for all architecture decisions.
   Never create decision notes manually.

8. **System dependencies** — Use `nerv dev/dependency-map` for dependency queries.
   Support `--json` for structured output.

## Quick Reference

nerv context dev-projectA "<query>" [5]
nerv create-entity dev-projectA <proj> <TYPE> <slug> "<Title>" <parent> <kind>
nerv add-connection dev-projectA "<src>" <rel> "<tgt>"
nerv dev/adr dev-projectA <proj> "<title>"
nerv dev/dependency-map dev-projectA <proj> [--json]
```

---

## Limitations

| ID  | Limitation                                | Impact                                                                         | Workaround                                                          |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| L1  | Obsidian must be running                  | All skills fail without it                                                     | Launch Obsidian before any CLI invocation                           |
| L2  | Single vault per CLI session              | Specifying a non-open vault silently falls back to active vault                | Open the correct vault before invoking skills                       |
| L3  | CLI requires macOS                        | No Linux/Windows                                                               | macOS-only deployment                                               |
| L4  | No web vault support                      | Local vaults only                                                              | iCloud-synced vaults must be open locally                           |
| L5  | One agent session per vault at a time     | Concurrent agents cause race conditions on shared notes                        | Serialise agent sessions per vault                                  |
| L7  | Bases requires Obsidian open              | `.base` files do not render without the app                                    | Use CLI skills for programmatic access; open app for visual queries |
| L8  | Daily note requires today's note to exist | `daily_append` and `nerv create-entity` logging fail if today's note is absent | Create today's journal note before running skills                   |

---

## Verification Checklist

These cases must be tested in a live Claude Code session with `--verbose`
to confirm tool-call logs show the correct skill invocation. This document
is not considered complete until all 5 are checked off.

- [ ] **Researcher** — ask "what is S3 lifecycle?" → tool log shows `nerv context study "S3 lifecycle"` invoked; answer cites note path
- [ ] **Writer** — say "save a note about SQS dead-letter queues in aws" → tool log shows `nerv create-entity`; note created in vault
- [ ] **Linker** — say "connect S3 overview to IAM basics with depends-on" → tool log shows `nerv add-connection`; inverse confirmed
- [ ] **Auditor** — say "run a weekly review" → tool log shows `nerv weekly-review --json`; findings presented by severity tier
- [ ] **Multi-vault** — say "create a note about logging" without specifying vault → Claude asks "Which vault: study or dev-projectA?" before invoking any skill
- [ ] **Failure mode** — run a skill with bad args (`nerv context study ""`) → agent retries once, then reports exact stderr; no silent fallback
