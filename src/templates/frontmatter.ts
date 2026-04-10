import type { EntityStatus } from '../types/entity';

/* ---------------------------------------------------------------------------
 * Entity frontmatter — shared by leaf, branch, root templates
 * --------------------------------------------------------------------------- */

export interface EntityFrontmatterData {
  title: string;
  type: 'LEAF' | 'BRANCH' | 'ROOT';
  kind: string;
  spine: string;
  status: EntityStatus;
  parent: string;
  created: string;
  modified: string;
}

export function renderEntityFrontmatter(data: EntityFrontmatterData): string {
  return `---
title: "${data.title}"
aliases: []
type: ${data.type}
kind: ${data.kind}
spine: ${data.spine}
status: ${data.status}
parent: "${data.parent}"
children: []
attachments: []
created: ${data.created}
modified: ${data.modified}
tags: []
---`;
}

/* ---------------------------------------------------------------------------
 * Project meta frontmatter — shared by ontology, vocab, topk (project scope)
 * --------------------------------------------------------------------------- */

export interface ProjectFrontmatterData {
  type: 'ONTOLOGY' | 'VOCAB' | 'TOPK';
  project: string;
  updated: string;
}

export function renderProjectFrontmatter(data: ProjectFrontmatterData): string {
  return `---
type: ${data.type}
project: ${data.project}
updated: ${data.updated}
---`;
}

/* ---------------------------------------------------------------------------
 * Vault template frontmatter — shared by vault ontology, vocab, topk
 * --------------------------------------------------------------------------- */

export interface VaultFrontmatterData {
  title: string;
  type: 'ONTOLOGY' | 'VOCAB' | 'TOPK';
  created: string;
  modified: string;
}

export function renderVaultFrontmatter(data: VaultFrontmatterData): string {
  return `---
title: "${data.title}"
type: ${data.type}
spine: ""
status: active
created: ${data.created}
modified: ${data.modified}
---`;
}

/* ---------------------------------------------------------------------------
 * Entity body sections — defines the markdown body for each entity type
 * --------------------------------------------------------------------------- */

const ENTITY_SECTIONS: Record<'LEAF' | 'BRANCH' | 'ROOT', readonly string[]> = {
  LEAF: ['Breadcrumb', 'Summary', 'Content', 'Connections', 'Flags'],
  BRANCH: ['Breadcrumb', 'Summary', 'Content', 'Connections', 'Flags'],
  ROOT: ['Summary', 'Map', 'Connections', 'Flags'],
};

export function renderEntityBody(type: 'LEAF' | 'BRANCH' | 'ROOT'): string {
  return ENTITY_SECTIONS[type].map(s => `## ${s}`).join('\n\n');
}
