---
title: 'Implement dev-specific skills'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 5
epic: 'EPIC-007 — Domain Skills: Study and Dev'
planKey: 'STORY-023'
phase: 5
sequence: 2
parallelTrack: B
size: 'M — ~0.5 day'
dependsOn:
  - STORY-021
  - STORY-007
  - STORY-008
blocks:
  - STORY-025
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 023 acceptance criteria'
---

## Goal

Author three dev-domain skills in `~/.ontology-cli/dev/`: `adr.sh` (creates an Architecture Decision Record as a LEAF note with `kind: decision` and structured Content sections), `dependency-map.sh` (filters the relationship graph to `depends-on` edges as JSON), and `code-link.sh` (appends a code reference to a note's `## Connections`).

## Acceptance Criteria

- [ ] `adr.sh dev-projectA svc "Use PostgreSQL for session storage"` creates a LEAF note with frontmatter `type: LEAF`, `kind: decision`, `decision-date: YYYY-MM-DD`, `decision-status: proposed`; `## Content` contains subsections `### Context`, `### Decision`, `### Consequences`
- [ ] Parent note's `children:` array is updated with the ADR wikilink; daily note is appended with the creation entry
- [ ] `dependency-map.sh dev-projectA svc` returns JSON: `{"project":"svc","edges":[{"source":"...","target":"...","context":"..."}]}` — only `depends-on` edges included
- [ ] `code-link.sh dev-projectA "projects/svc/SVC.auth - Auth Service.md" "src/auth/handler.ts"` appends `- implements :: \`src/auth/handler.ts\``to`## Connections`; re-running the same command exits 0 with no duplicate line added (idempotent)
- [ ] All three scripts accept `vault=` parameter; exit 0 on success, 1 on error
- [ ] `tests/test-adr.sh`, `tests/test-dependency-map.sh`, and `tests/test-code-link.sh` pass in the test harness

## Additional Information

`adr.sh` generates the slug from the title: lowercase, replace spaces with `-`, prepend `adr-YYYYMMDD-`. `dependency-map.sh` is a thin wrapper around `cli-relations.sh --json` filtered to `rel === "depends-on"`. `code-link.sh` uses `app.vault.process` for atomic write; idempotency check scans the existing Connections body for the exact code path string before writing.

> [!important]
> `adr.sh` must use `create-entity.sh` internally for the note creation step — do not reimplement entity creation. This ensures ADRs comply with all entity creation rules (frontmatter, parent wiring, daily note logging) established in STORY-006.

## System Design

- [PLAN.md — Story 023](../PLAN.md)
- [obsidian_docs.md — v11 ADR pattern, dev domain skills, code-link format](../obsidian_docs.md)

## Resources

- [ADR slug generation from title](https://adr.github.io/): `echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-'` produces a clean URL-safe slug; prepend `adr-$(date +%Y%m%d)-` for chronological ordering
- [`cli-relations.sh --json` filtering with Python](https://docs.python.org/3/library/json.html): `python3 -c "import json,sys; data=json.load(sys.stdin); data['edges']=[e for e in data['edges'] if e['rel']=='depends-on']; print(json.dumps(data))"` filters the edge list; pipe from `cli-relations.sh --json`
- [Obsidian `app.vault.process` for idempotent append](https://docs.obsidian.md/Reference/TypeScript+API/Vault/process): read current content, search for the exact code path string with `content.includes(codePath)`, append only if absent, write back atomically

## Recommendations

- The `### Context`, `### Decision`, `### Consequences` subsections in the ADR Content should include inline prompts (as HTML comments or italicized hints) to guide the developer: `*What is the problem being solved?*`
- `dependency-map.sh` should support a `--format dot` flag for GraphViz output in addition to JSON — useful for visualizing large dependency graphs
- Document the ADR lifecycle in `patterns.md`: created as `decision-status: proposed` → reviewed by team → updated to `accepted` or `rejected` via `cli-lint`-enforced field update

## Security Considerations

| Area                | Risk                                                               | Mitigation                                                                                                                         |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Code path injection | `code-link.sh` writes the `CODEPATH` argument verbatim into a note | Validate that `CODEPATH` does not contain `]]` (would break the wikilink syntax) or newlines (would break the Connections section) |

---

> **Blocks**:
>
> - STORY-025 ⛔ — Build and execute E2E test suite (dev E2E validates adr, dependency-map, code-link)
