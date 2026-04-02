export interface InboxParams {
  title: string;
  /** YYYY-MM-DD or `{{date}}` template token */
  captured: string;
}

export function renderInbox(params: InboxParams): string {
  return `---
title: "${params.title}"
captured: ${params.captured}
source: ""
target: ""
status: inbox
---

> [!todo] Triage
> - [ ] Identify note type (LEAF / BRANCH / ROOT)
> - [ ] Determine parent
> - [ ] Move to correct project folder
> - [ ] Delete this inbox copy

## Raw

<!-- Paste raw captured content here -->

## Placement Notes

<!-- Where should this go? What spine does it belong to? -->
`;
}
