export interface TopkParams {
  project: string;
  updated: string; // YYYY-MM-DD
}

export function renderTopk(params: TopkParams): string {
  return `---
type: TOPK
project: ${params.project}
updated: ${params.updated}
---

## Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Connections per note | 7 | Prevents over-linking; forces pruning |
| Callout flags per note | 3 | Keeps flags scannable |
| BRANCH children | 7 | Keeps tree manageable |
| LEAF children | 5 | LEAF nodes should not branch deeply |

## Overflow Log

| Date | Note | Field | Count | Action |
|------|------|-------|-------|--------|

## Split History

| Date | Original | Split Into | Reason |
|------|----------|------------|--------|
`;
}
