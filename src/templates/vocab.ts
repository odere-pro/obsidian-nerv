import { renderProjectFrontmatter, renderVaultFrontmatter } from './frontmatter';

export interface VocabParams {
  project: string;
  /** YYYY-MM-DD */
  updated: string;
}

export function renderVocab(params: VocabParams): string {
  const fm = renderProjectFrontmatter({
    type: 'VOCAB',
    project: params.project,
    updated: params.updated,
  });
  return `${fm}

## L0 — Spine Roots

## L1 — Primary Branches

## L2 — Secondary Branches

## L3 — Leaves

## Shared Terms

## Orphan Terms
`;
}

/* ---------------------------------------------------------------------------
 * Vault template variant — used by init-vault for Obsidian template files
 * --------------------------------------------------------------------------- */

export interface VaultVocabParams {
  title: string;
  /** YYYY-MM-DD or `{{date}}` template token */
  created: string;
  modified: string;
}

export function renderVaultVocab(params: VaultVocabParams): string {
  const fm = renderVaultFrontmatter({
    title: `${params.title} Vocabulary`,
    type: 'VOCAB',
    created: params.created,
    modified: params.modified,
  });
  return `${fm}

# Vocabulary

## L0 — Core Terms

<!-- Foundational terms required to understand the domain -->

## L1 — Primary Terms

<!-- Primary domain terms -->

## L2 — Secondary Terms

<!-- Supporting terms -->

## L3 — Peripheral Terms

<!-- Edge-case or rarely-used terms -->

## Shared Terms

<!-- Terms shared with other spines — link to canonical definition -->

## Orphan Terms

<!-- Terms not yet categorized -->
`;
}
