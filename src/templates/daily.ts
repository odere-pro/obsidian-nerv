export interface DailyParams {
  date: string; // YYYY-MM-DD or {{date}}
}

export function renderDaily(params: DailyParams): string {
  return `---
title: "${params.date}"
type: daily-note
date: ${params.date}
tags: [journal/daily]
---

## Ontology Work Log

### Entities Created

<!-- List new notes created today -->

### Schema Changes

<!-- Frontmatter changes, new relationship types, type renames -->

### Decisions

<!-- Architectural or naming decisions made -->

### Open Questions

<!-- Questions surfaced that need follow-up -->

## Triage

\`\`\`query
path:_inbox
\`\`\`

## Tasks

- [ ]

## Notes

<!-- Freeform notes for the day -->
`;
}
