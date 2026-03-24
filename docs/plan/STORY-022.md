---
title: 'Implement study-specific skills and Quizmaster integration'
team: 'Obsidian Nervous System'
priority: 'Medium'
storyPoints: 5
epic: 'EPIC-007 — Domain Skills: Study and Dev'
planKey: 'STORY-022'
phase: 5
sequence: 1
parallelTrack: A
size: 'L — ~1 day'
dependsOn:
  - STORY-021
  - STORY-016
blocks:
  - STORY-025
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 022 acceptance criteria'
---

## Goal

Author three study-domain skills in `~/.ontology-cli/study/`: `coverage.sh` (maps spine branches to certification domains and reports % stable per domain), `quiz.sh` (extracts summaries and connections from stable/review notes formatted for AI quiz generation), and `progress.sh` (study progress dashboard as JSON). Extend `patterns.md` with the Quizmaster subagent decision tree.

## Acceptance Criteria

- [ ] `coverage.sh study aws` returns JSON: `{"project":"aws","domains":[{"spine":"...","total":N,"stable":N,"review":N,"draft":N,"coverage":X.X}],"overall":{"totalNotes":N,"avgCoverage":X.X}}` — coverage is `stable / total * 100` rounded to 1 decimal place
- [ ] `quiz.sh study aws storage 5` returns JSON: `{"instruction":"<quiz generation instruction>","spine":"storage","notes":[{"title":"...","kind":"...","summary":"...","content":"<first 500 chars>","connections":[...]}]}` — shuffled, limited to 5 entries, excluding drafts
- [ ] `progress.sh study aws` returns JSON: `{"project":"aws","notes":{"total":N,"stable":N,"review":N,"draft":N},"completion":X.X,"knowledge":{"totalWords":N,"totalEdges":N,"avgEdgesPerNote":X.X},"thisWeek":["<basename>",...]}`— `thisWeek` contains basenames of notes modified in the last 7 days
- [ ] Quizmaster pattern documented in `patterns.md`: "quiz me on X" intent → `quiz.sh` invoked → questions generated from vault content only → after quiz, weak areas mapped to specific note paths → user offered to review or enrich those notes
- [ ] All three scripts accept `vault=` parameter; exit 0 on success, 1 on error
- [ ] The `instruction` field in `quiz.sh` enforces vault-grounded questions only, rejecting questions requiring external knowledge not present in the provided note content
- [ ] `tests/test-coverage.sh`, `tests/test-quiz.sh`, and `tests/test-progress.sh` pass in the test harness

## Additional Information

`quiz.sh` shuffles note order using `sort -R` (macOS built-in, zero installs). The Quizmaster pattern extends `patterns.md` from STORY-021 — it does not create a new file.

> [!important]
> The `instruction` field in `quiz.sh` output must explicitly state "only ask questions answerable from the provided note content" — this prevents the agent from fabricating quiz questions from training data and presenting them as vault-grounded knowledge.

## System Design

- [PLAN.md — Story 022](../PLAN.md)
- [obsidian_docs.md — v11 Study domain, spine hierarchy, Quizmaster subagent pattern](../obsidian_docs.md)

## Resources

- [macOS `sort -R` for random shuffle](https://ss64.com/mac/sort.html): `sort -R file` randomly shuffles lines on macOS; combine with `head -n N` to limit output; pipe a list of note paths then process each shuffled entry
- [JavaScript `Date` for `thisWeek` filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date): `file.stat.mtime > Date.now() - 7*24*60*60*1000` filters files modified in the last 7 days; `file.stat.mtime` is available on Obsidian `TFile` objects
- [Coverage percentage rounding](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round): `Math.round((stable / total * 100) * 10) / 10` for 1 decimal place; guard against `total === 0` with `total > 0 ? ... : 0`

## Recommendations

- The `quiz.sh` `instruction` field should be a complete system prompt fragment that the Researcher subagent can prepend to the quiz generation request — include the note content inline as the knowledge source
- `coverage.sh` spine grouping should match the project's `_topk` spine hierarchy — read the spine list from the vocab file rather than hardcoding domain names
- Include a `--format compact` flag on `progress.sh` that returns a single-line summary for daily note embedding: `aws: 42 notes, 73% stable, 156 edges`

---

> **Blocks**:
>
> - STORY-025 ⛔ — Build and execute E2E test suite (study E2E validates coverage, quiz, progress)
