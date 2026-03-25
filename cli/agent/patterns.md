# Agent Routing Patterns

Signal-routing reference for the Obsidian Nervous System agent layer.
Each pattern encodes which user intent maps to which CLI skill sequence,
how to compose multiple skills into a complete response, and how to handle
failures. Claude Code reads this document as part of session context via
`~/.ontology-cli/agent/patterns.md`.

> **Rule 0 — Vault-first, always.**
> The `context.sh` rule fires on every turn before any write or link rule.
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
├─► Invoke context.sh <vault> "<query>" [<limit>]
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

1. `context.sh <vault> "<query>" 5`
2. (optional) `get-tree.sh <vault> <project>` — if user asks about project shape or coverage
3. (optional) `explain-topic.sh <vault> <project> "<topic>"` — if user wants a teaching bundle

### Expected output shape

```
Based on [[AWS.S3 - S3 Overview]] (projects/aws/AWS.S3 - S3 Overview.md):

S3 lifecycle rules transition objects between storage classes after a
configurable number of days. Transition to Glacier costs $0.05/GB...

Sources cited: [[AWS.S3 - S3 Overview]], [[AWS.IAM - IAM Basics]]
```

### Failure mode

| Failure | Action |
|---------|--------|
| `context.sh` exits non-zero | Retry once with identical args; if still failing, report: "Vault retrieval failed — answering from training data (vault unreachable)." |
| `context.sh` returns malformed JSON | Treat as empty results; answer from training data; report: "context.sh returned unexpected output." |
| Obsidian unreachable (L1) | Inform user: "Obsidian must be running for vault retrieval. Answering from training data." |

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

| Signal in user prompt | Inferred type |
|-----------------------|---------------|
| Describes a single atomic concept, fact, or definition | LEAF |
| Implies sub-topics, categories, or groupings ("it has several aspects", "there are types of") | BRANCH |
| User explicitly says "project", "initiative", "domain" | ROOT (only via `create-project.sh`) |
| Unambiguous type stated by user | Use stated type |

### Decision tree

```
User wants to save knowledge
│
├─► Invoke context.sh <vault> "<title or topic>" 3
│   └─ If a highly relevant note already exists (score ≥ 15):
│       ├─► Show the existing note: "Found [[Existing Note]] — update it instead?"
│       └─► Wait for user confirmation before creating
│
├─► Infer type (LEAF / BRANCH) from content signals
│
├─► Invoke create-entity.sh <vault> <project> <type> "<title>" [<parent>]
│   └─ Capture returned note path
│
├─ User mentioned connections / relationships?
│   └─► Invoke add-connection.sh <vault> <source-path> <rel> <target-path>
│       for each named connection
│
└─► Confirm: "Saved [[Note Title]] in projects/<project>.
             Daily note updated."
```

### Skill invocation sequence

1. `context.sh <vault> "<title>" 3` — deduplication check
2. `create-entity.sh <vault> <project> <type> "<title>" ["<parent>"]`
3. (conditional) `add-connection.sh <vault> "<source>" <rel> "<target>"` — one call per connection

### Expected output shape

```
Created [[AWS.S3-Lifecycle - S3 Lifecycle Rules]] in projects/aws.
Type: LEAF  Parent: [[AWS.S3 - S3 Overview]]
Connection added: depends-on → [[AWS.IAM - IAM Basics]]
Daily note updated.
```

### Failure mode

| Failure | Action |
|---------|--------|
| `create-entity.sh` exits non-zero | Retry once; if still failing, report the exact stderr verbatim. Do not attempt manual file creation. |
| `add-connection.sh` exits non-zero after note created | Report: "Note created but connection failed: <verbatim error>. Check `_inbox/_rollback-log.md`." |
| Parent note not found | Ask user: "Which note should be the parent? (or omit for no parent)" |
| Project does not exist | Ask user: "Project '<slug>' not found. Run `create-project.sh`?" |

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
├─► Resolve source note path via context.sh if not explicit
├─► Resolve target note path via context.sh if not explicit
│
├─► Check source connection count:
│   invoke cli-lint.sh <vault> <source-folder> --json
│   └─ If connections > 7:
│       └─► Warn: "[[Source]] already has N connections (limit 7). Proceed?"
│           Wait for explicit confirmation.
│
├─► Invoke add-connection.sh <vault> "<source>" <rel> "<target>"
│   ├─ Script writes forward connection on source
│   └─ Script writes inverse connection on target automatically
│
└─► Confirm: "Connection added: [[Source]] –<rel>→ [[Target]]
              Inverse written: [[Target]] –<inverse>→ [[Source]]"
```

### Skill invocation sequence

1. `context.sh <vault> "<source title>" 1` — resolve source (if path unknown)
2. `context.sh <vault> "<target title>" 1` — resolve target (if path unknown)
3. `cli-lint.sh <vault> <source folder> --json` — check connection limit
4. `add-connection.sh <vault> "<source-path>" <rel> "<target-path>"`

### Valid relationship types

Defined in each project's `_ontology.<project>.md`. Common types:

| Type | Inverse |
|------|---------|
| `depends-on` | `dependency-of` |
| `part-of` | `contains` |
| `implements` | `implemented-by` |
| `extends` | `extended-by` |
| `related-to` | `related-to` |

If user specifies an unrecognised type, emit: "Unknown relation type '<type>'.
Valid types for project <slug>: <list from _ontology>. Use one of those?"

### Expected output shape

```
Connection added:
  [[AWS.S3 - S3 Overview]] –depends-on→ [[AWS.IAM - IAM Basics]]
  Inverse: [[AWS.IAM - IAM Basics]] –dependency-of→ [[AWS.S3 - S3 Overview]]
```

### Failure mode

| Failure | Action |
|---------|--------|
| `add-connection.sh` exits non-zero | Retry once; report exact stderr verbatim if still failing. |
| Source note not found in vault | Report: "Could not locate '<source>' in vault. Please verify the note title." |
| Target note not found | Same as source not found. |
| Relation type not in ontology | Prompt for valid type (see above). Do not silently substitute a different type. |

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
├─► Invoke weekly-review.sh <vault> --json
│   └─ Captures: lint findings, orphan nodes, relation gaps, sync state
│
├─► Also read _inbox/_rollback-log.md for partial-state entries
│   └─ invoke context.sh <vault> "rollback log" 1  (or direct path read)
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
│   └─► Offer programmatic fix: "Fix broken link in [[Note]]? (add-connection.sh)"
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

1. `weekly-review.sh <vault> --json`
2. (conditional) `cli-lint.sh <vault> <folder> --json` — targeted re-lint
3. (conditional) `add-connection.sh <vault> "<source>" <rel> "<target>"` — fix missing inverse
4. (conditional) `sync-topk.sh <vault> <project>` — sync overflow after fixes

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

| Failure | Action |
|---------|--------|
| `weekly-review.sh` exits non-zero | Retry once; report exact stderr verbatim. |
| Partial `--json` output (malformed) | Fall back to text output; note: "JSON triage unavailable, showing raw output." |
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

| Failure | Action |
|---------|--------|
| User provides an unrecognised vault name | Report available vaults; do not proceed. |
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
- Never skip `context.sh` before answering a knowledge question, even when
  confident the answer is in training data. The vault-first rule is
  unconditional.
- Never mark a skill story complete based on documentation alone — live tool
  call logs must confirm the correct skill invocation (STORY-021 acceptance
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

## Verification Checklist (STORY-021)

These cases must be tested in a live Claude Code session with `--verbose`
to confirm tool-call logs show the correct skill invocation. This document
is not considered complete until all 5 are checked off.

- [ ] **Researcher** — ask "what is S3 lifecycle?" → tool log shows `context.sh study "S3 lifecycle"` invoked; answer cites note path
- [ ] **Writer** — say "save a note about SQS dead-letter queues in aws" → tool log shows `create-entity.sh`; note created in vault
- [ ] **Linker** — say "connect S3 overview to IAM basics with depends-on" → tool log shows `add-connection.sh`; inverse confirmed
- [ ] **Auditor** — say "run a weekly review" → tool log shows `weekly-review.sh --json`; findings presented by severity tier
- [ ] **Multi-vault** — say "create a note about logging" without specifying vault → Claude asks "Which vault: study or dev-projectA?" before invoking any skill
- [ ] **Failure mode** — run a skill with bad args (`context.sh study ""`) → agent retries once, then reports exact stderr; no silent fallback
