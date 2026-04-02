export interface TopkParams {
  project: string;
  /** YYYY-MM-DD */
  updated: string;
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

/* ---------------------------------------------------------------------------
 * Vault template variant — used by init-vault for Obsidian template files
 * --------------------------------------------------------------------------- */

export interface VaultTopkParams {
  title: string;
  /** YYYY-MM-DD or `{{date}}` template token */
  created: string;
  modified: string;
}

export function renderVaultTopk(params: VaultTopkParams): string {
  return `---
title: "${params.title} Top-K"
type: TOPK
spine: ""
status: active
created: ${params.created}
modified: ${params.modified}
---

# Top-K Limits

| Category | Limit | Current Count | Notes |
|----------|-------|---------------|-------|
| Root notes | 10 | 0 | Hard cap — split spine if exceeded |
| Branch notes per root | 20 | 0 | |
| Leaf notes per branch | 50 | 0 | |
| Relationship types | 15 | 10 | Includes 10 defaults |
| Vocab terms (total) | 200 | 0 | |

## Overflow Log

<!-- Record here when a limit is approached or exceeded -->

## Split History

<!-- Record spine splits performed to maintain top-k limits -->
`;
}
