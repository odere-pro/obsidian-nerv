// cli-relations — Reflex skill: enumerate typed connections and validate against ontology.
//
// Exports:
//   - Edge, RelationResult (types)
//   - extractEdges(notes, validTypes) — pure function, unit-testable without Obsidian
//   - getRelations(vault, project) — programmatic API used by dependency-map
//   - default Command — CLI entry point
//
// JSON schema (--json) is stable and matches existing Bash output for Auditor compatibility:
//   {"project":"...","edges":[{"source":"...","target":"...","rel":"...","context":"..."}],
//    "summary":{...},"unknownTypes":[...]}

import type { Command } from '../cli';
import { resolveVault } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import { extractSection } from './cli-lint';
import { extractVaultFlag } from '../lib/vault-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Edge {
  source: string;
  target: string;
  rel: string;
  context: string;
}

export interface RelationResult {
  project: string;
  edges: Edge[];
  summary: Record<string, number>;
  unknownTypes: string[];
}

export interface RawRelNote {
  basename: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Pure extraction logic
// ---------------------------------------------------------------------------

const CONN_RE = /^- ([a-z][a-z0-9-]*) :: \[\[([^\]]+)\]\](?:\s*—\s*(.*))?$/;

/** Extract typed edges from raw note bodies. Pure function, no Obsidian. */
export function extractEdges(
  notes: RawRelNote[],
  validTypes: Set<string>
): Omit<RelationResult, 'project'> {
  const edges: Edge[] = [];
  const relCounts: Record<string, number> = {};
  const unknownSet = new Set<string>();
  const hasOntology = validTypes.size > 0;

  for (const note of notes) {
    const connSection = extractSection(note.body, 'Connections');
    for (const line of connSection.split('\n')) {
      const m = line.trim().match(CONN_RE);
      if (!m) continue;
      const rel = m[1];
      const target = m[2];
      const context = m[3] ?? '';
      edges.push({ source: note.basename, rel, target, context });
      relCounts[rel] = (relCounts[rel] ?? 0) + 1;
      if (hasOntology && !validTypes.has(rel)) {
        unknownSet.add(rel);
      }
    }
  }

  const summary = Object.fromEntries(Object.entries(relCounts).sort((a, b) => b[1] - a[1]));

  return { edges, summary, unknownTypes: [...unknownSet] };
}

// ---------------------------------------------------------------------------
// VaultOps data fetch + ontology parsing in TypeScript
// ---------------------------------------------------------------------------

function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
}

/** Parse valid relationship types from an _ontology file's ## Relationship Types table. */
function parseValidTypes(content: string): string[] {
  const lines = content.split('\n');
  const types: string[] = [];
  let inTable = false;
  for (const line of lines) {
    if (/^## Relationship Types/.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /^## /.test(line)) break;
    if (inTable && line.startsWith('|')) {
      const col = (line.split('|')[1] ?? '').replace(/[`\s]/g, '');
      if (col && col !== 'Type' && !/^-+$/.test(col)) types.push(col);
    }
  }
  return types;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/** Get typed relations for a project. Used by dependency-map. */
export async function getRelations(vault: string, project: string): Promise<RelationResult> {
  const ops = getVaultOps();
  const folder = project.includes('/') ? project : `projects/${project}`;

  const allFiles = await ops.listFiles(vault).catch(() => []);
  const folderFiles = allFiles.filter(
    e => folder && (e.path.startsWith(folder + '/') || e.path === folder)
  );

  // Load valid relationship types from _ontology files
  const ontologyFiles = folderFiles.filter(e =>
    (e.path.split('/').pop() ?? '').startsWith('_ontology')
  );
  const allValidTypes: string[] = [];
  for (const of_ of ontologyFiles) {
    const file = await ops.readFile(vault, of_.path);
    allValidTypes.push(...parseValidTypes(file.content));
  }
  const validTypes = new Set(allValidTypes);

  // Read note files to extract connections
  const noteFiles = folderFiles.filter(e => {
    const name = e.path.split('/').pop() ?? '';
    return (
      !name.startsWith('_vocab') &&
      !name.startsWith('_topk') &&
      !name.startsWith('_ontology') &&
      !name.startsWith('tpl-')
    );
  });

  const notes: RawRelNote[] = [];
  for (const entry of noteFiles) {
    const file = await ops.readFile(vault, entry.path);
    const body = stripFrontmatter(file.content);
    const basename = (entry.path.split('/').pop() ?? '').replace(/\.md$/, '');
    notes.push({ basename, body });
  }

  const result = extractEdges(notes, validTypes);
  return { project, ...result };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'cli-relations',
  description: 'Enumerate typed connections and validate against ontology',

  async run(args: string[]): Promise<void> {
    let jsonOutput = false;
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];
    for (const a of rest) {
      if (a === '--json') jsonOutput = true;
      else positional.push(a);
    }

    const vault = await resolveVault(vaultArg);
    const rawFolder = positional[0] ?? '';

    const fullResult = await getRelations(vault, rawFolder);

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(fullResult) + '\n');
    } else {
      for (const e of fullResult.edges) {
        process.stdout.write(`${e.source} --${e.rel}--> ${e.target}\n`);
      }
      for (const t of fullResult.unknownTypes) {
        process.stdout.write(`⚠ Unknown relationship type: '${t}'\n`);
      }
      if (Object.keys(fullResult.summary).length > 0) {
        process.stdout.write('\nSummary:\n');
        for (const [rel, count] of Object.entries(fullResult.summary)) {
          process.stdout.write(`  ${rel}: ${count}\n`);
        }
      }
      process.stdout.write(
        `\nRelations complete. ${fullResult.edges.length} edge(s) across ${Object.keys(fullResult.summary).length} relationship type(s).\n`
      );
    }
  },
};

export default command;
