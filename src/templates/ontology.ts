export interface OntologyParams {
  project: string;
  /** YYYY-MM-DD */
  updated: string;
}

export function renderOntology(params: OntologyParams): string {
  return `---
type: ONTOLOGY
project: ${params.project}
updated: ${params.updated}
---

## Relationship Types

| Type | Inverse | Symmetric | Description |
|------|---------|-----------|-------------|
| \`triggers\` | \`triggered-by\` | false | A causes B to occur |
| \`depends-on\` | \`depended-by\` | false | A requires B to function |
| \`implements\` | \`implemented-by\` | false | A is a concrete realisation of abstract concept B |
| \`extends\` | \`extended-by\` | false | A adds to or specialises B |
| \`compares-to\` | \`compares-to\` | true | A and B are analysed side-by-side |
| \`replaces\` | \`replaced-by\` | false | A supersedes B |
| \`feeds-data\` | \`fed-by\` | false | A supplies data to B |
| \`authenticates-via\` | \`authenticates\` | false | A uses B for authentication |
| \`contains\` | \`contained-by\` | false | A is the parent container of B |
| \`mitigates\` | \`mitigated-by\` | false | A reduces risk posed by B |
`;
}

/* ---------------------------------------------------------------------------
 * Vault template variant — used by init-vault for Obsidian template files
 * --------------------------------------------------------------------------- */

export interface VaultOntologyParams {
  title: string;
  /** YYYY-MM-DD or `{{date}}` template token */
  created: string;
  modified: string;
}

export function renderVaultOntology(params: VaultOntologyParams): string {
  return `---
title: "${params.title} Ontology"
type: ONTOLOGY
spine: ""
status: active
created: ${params.created}
modified: ${params.modified}
---

# Relationship Types

| \`type\` | Direction | \`inverse\` | Description |
|--------|-----------|-----------|-------------|
| \`triggers\` | A → B | \`triggered-by\` | A causes B to occur |
| \`depends-on\` | A → B | \`depended-by\` | A requires B to function |
| \`implements\` | A → B | \`implemented-by\` | A is a concrete realization of B |
| \`extends\` | A → B | \`extended-by\` | A adds to or specializes B |
| \`compares-to\` | A ↔ B | \`compares-to\` | A and B are compared or contrasted |
| \`replaces\` | A → B | \`replaced-by\` | A supersedes or deprecates B |
| \`feeds-data\` | A → B | \`fed-data-by\` | A supplies data consumed by B |
| \`authenticates-via\` | A → B | \`authenticated-by\` | A uses B for identity verification |
| \`contains\` | A → B | \`contained-by\` | A is a parent container of B |
| \`mitigates\` | A → B | \`mitigated-by\` | A reduces the risk or impact of B |

## Custom Types

<!-- Add project-specific relationship types below (include inverse column) -->

| \`type\` | Direction | \`inverse\` | Description |
|--------|-----------|-----------|-------------|
`;
}
