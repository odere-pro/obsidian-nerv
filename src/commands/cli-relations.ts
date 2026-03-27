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
import { encodeForJs, parseJson } from '../lib/json';
import { obEval, resolveVault } from '../lib/obsidian';
import { extractSection } from './cli-lint';

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
// Obsidian data fetch
// ---------------------------------------------------------------------------

interface RawRelFetch {
  notes: RawRelNote[];
  validTypes: string[];
}

function buildFetchExpr(folder: string): string {
  const jsFolder = encodeForJs(folder);
  return `(async () => {
  var folder = ${jsFolder};
  var allFiles = app.vault.getFiles().filter(function(f) {
    if (f.extension !== 'md') return false;
    if (folder && !f.path.startsWith(folder + '/') && f.path !== folder) return false;
    return true;
  });

  // Load valid relationship types from _ontology.*.md files
  var ontologyFiles = allFiles.filter(function(f) { return f.name.startsWith('_ontology'); });
  var validTypes = {};
  for (var oi = 0; oi < ontologyFiles.length; oi++) {
    var oContent = await app.vault.cachedRead(ontologyFiles[oi]);
    var oLines = oContent.split('\\n');
    var inTable = false;
    for (var ol = 0; ol < oLines.length; ol++) {
      var oLine = oLines[ol];
      if (/^## Relationship Types/.test(oLine)) { inTable = true; continue; }
      if (inTable && /^## /.test(oLine)) { inTable = false; break; }
      if (inTable && /^\\|/.test(oLine)) {
        var col = (oLine.split('|')[1] || '').replace(/[\`\\s]/g, '');
        if (col && col !== 'Type' && !/^-+$/.test(col)) validTypes[col] = true;
      }
    }
  }

  // Note files to scan
  var noteFiles = allFiles.filter(function(f) {
    var n = f.name;
    return !n.startsWith('_vocab') && !n.startsWith('_topk') &&
           !n.startsWith('_ontology') && !n.startsWith('tpl-');
  });

  var notes = [];
  for (var ni = 0; ni < noteFiles.length; ni++) {
    var nf = noteFiles[ni];
    var content = await app.vault.cachedRead(nf);
    var body = content.replace(/^---[\\s\\S]*?---\\n?/, '');
    notes.push({ basename: nf.basename, body: body });
  }

  return JSON.stringify({ notes: notes, validTypes: Object.keys(validTypes) });
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/** Get typed relations for a project. Used by dependency-map. */
export async function getRelations(vault: string, project: string): Promise<RelationResult> {
  const folder = project.includes('/') ? project : `projects/${project}`;
  const raw = await obEval(vault, buildFetchExpr(folder)).catch(
    () => '{"notes":[],"validTypes":[]}'
  );
  const fetched = parseJson<RawRelFetch>(raw) ?? { notes: [], validTypes: [] };
  const validTypes = new Set(fetched.validTypes);
  const result = extractEdges(fetched.notes, validTypes);
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
    const positional: string[] = [];
    for (const a of args) {
      if (a === '--json') jsonOutput = true;
      else positional.push(a);
    }

    if (positional.length < 1) {
      process.stderr.write('Usage: nerv cli-relations <vault|vault=name> [<folder>] [--json]\n');
      process.exit(1);
    }

    const vault = await resolveVault(positional[0]);
    const rawFolder = positional[1] ?? '';
    const raw = await obEval(vault, buildFetchExpr(rawFolder)).catch(
      () => '{"notes":[],"validTypes":[]}'
    );
    const fetched = parseJson<RawRelFetch>(raw) ?? { notes: [], validTypes: [] };
    const validTypes = new Set(fetched.validTypes);
    const result = extractEdges(fetched.notes, validTypes);
    const fullResult: RelationResult = { project: rawFolder, ...result };

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
