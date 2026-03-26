// STORY-032 — Note template extraction: vocab template

export interface VocabParams {
  project: string;
  updated: string; // YYYY-MM-DD
}

export function renderVocab(params: VocabParams): string {
  return `---
type: VOCAB
project: ${params.project}
updated: ${params.updated}
---

## L0 — Spine Roots

## L1 — Primary Branches

## L2 — Secondary Branches

## L3 — Leaves

## Shared Terms

## Orphan Terms
`;
}
