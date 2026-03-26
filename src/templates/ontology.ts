// STORY-032 — Note template extraction: ontology template

export interface OntologyParams {
  project: string;
  updated: string; // YYYY-MM-DD
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
