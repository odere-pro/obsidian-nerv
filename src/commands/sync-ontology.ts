// sync-ontology — Autonomic skill: produce ontology health report for a project.
//
// Scans ## Connections sections, compares rel-types against _ontology.<slug>.md,
// reports entity distribution, relationship usage, missing inverses, and unknown types.
// Calls getRelations() directly (no subprocess) for edge data.
//
// JSON schema (--json):
//   {"entities":{"ROOT":N,"BRANCH":N,"LEAF":N},
//    "edges":M,"missingInverses":[{"source":"...","rel":"...","target":"..."}],
//    "incomplete":P}
//
// Idempotent: updates `updated:` date in ontology artifact file on every run.

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { logError } from '../lib/logger';
import { obEval, resolveVault } from '../lib/obsidian';
import { getRelations } from './cli-relations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OntologyMeta {
  noteCount: number;
  entities: Record<string, number>;
  kinds: Record<string, number>;
  spines: Record<string, number>;
  statuses: Record<string, number>;
  incomplete: number;
}

export interface MissingInverse {
  source: string;
  rel: string;
  target: string;
}

export interface OntologyResult {
  entities: Record<string, number>;
  edges: number;
  missingInverses: MissingInverse[];
  incomplete: number;
}

// ---------------------------------------------------------------------------
// Missing inverse detection — pure function
// ---------------------------------------------------------------------------

/** Detect edges that have no corresponding reverse edge in the edge set. */
export function detectMissingInverses(
  edges: { source: string; rel: string; target: string }[]
): MissingInverse[] {
  const missing: MissingInverse[] = [];
  for (const e of edges) {
    const hasReverse = edges.some(e2 => e2.source === e.target && e2.target === e.source);
    if (!hasReverse) {
      missing.push({ source: e.source, rel: e.rel, target: e.target });
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Obsidian data fetch
// ---------------------------------------------------------------------------

function buildMetaFetchExpr(slug: string): string {
  const jsSlug = encodeForJs(slug);
  return `(async () => {
  var slug = ${jsSlug};
  var projDir = 'projects/' + slug;
  var REQUIRED = ['title', 'type', 'kind', 'spine', 'status'];

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab') && !n.startsWith('_topk') &&
           !n.startsWith('_ontology') && !n.startsWith('tpl-');
  });

  var entities = {ROOT: 0, BRANCH: 0, LEAF: 0};
  var kinds = {}, spines = {}, statuses = {};
  var incomplete = 0;

  notes.forEach(function(f) {
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var type = fm.type ? String(fm.type) : 'LEAF';
    var kind = fm.kind ? String(fm.kind) : '';
    var spine = fm.spine ? String(fm.spine) : '';
    var status = fm.status ? String(fm.status) : 'draft';

    if (entities[type] !== undefined) entities[type]++;
    else entities[type] = 1;
    if (kind)  kinds[kind]   = (kinds[kind]   || 0) + 1;
    if (spine) spines[spine] = (spines[spine] || 0) + 1;
    statuses[status] = (statuses[status] || 0) + 1;

    var missing = REQUIRED.some(function(k) {
      var v = fm[k]; return v === undefined || v === null || v === '';
    });
    if (missing) incomplete++;
  });

  return JSON.stringify({
    noteCount: notes.length, entities: entities,
    kinds: kinds, spines: spines, statuses: statuses, incomplete: incomplete
  });
})()`;
}

function buildUpdateDateExpr(slug: string): string {
  const jsSlug = encodeForJs(slug);
  const today = new Date().toISOString().split('T')[0];
  const jsToday = encodeForJs(today);
  return `(async () => {
  var slug = ${jsSlug};
  var today = ${jsToday};
  var ontoPath = 'projects/' + slug + '/_ontology.' + slug + '.md';
  var f = app.vault.getAbstractFileByPath(ontoPath);
  if (f) await app.fileManager.processFrontMatter(f, function(fm) { fm.updated = today; });
  return 'ok';
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/** Run ontology health analysis for a project. Used by weekly-review. */
export async function syncOntology(vault: string, slug: string): Promise<OntologyResult> {
  const relResult = await getRelations(vault, slug).catch(() => ({
    project: slug,
    edges: [],
    summary: {},
    unknownTypes: [],
  }));

  const metaRaw = await obEval(vault, buildMetaFetchExpr(slug)).catch(() => '');
  if (!metaRaw) throw new Error('sync-ontology: Obsidian not reachable or eval failed');

  const meta = parseJson<OntologyMeta>(metaRaw);
  if (!meta) throw new Error('sync-ontology: unexpected response from Obsidian');

  const edges = relResult.edges;
  const missingInverses = detectMissingInverses(edges).slice(0, 20);

  await obEval(vault, buildUpdateDateExpr(slug)).catch(() => undefined);

  return {
    entities: meta.entities,
    edges: edges.length,
    missingInverses,
    incomplete: meta.incomplete,
  };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'sync-ontology',
  description: 'Produce ontology health report for a project',

  async run(args: string[]): Promise<void> {
    let jsonOutput = false;
    const positional: string[] = [];
    for (const a of args) {
      if (a === '--json') jsonOutput = true;
      else positional.push(a);
    }

    if (positional.length < 2) {
      process.stderr.write(
        'Usage: nerv sync-ontology <vault|vault=name> <project_slug> [--json]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(positional[0]);
    const slug = positional[1];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      logError(
        `sync-ontology: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    // Fetch relations via getRelations (no subprocess)
    const relResult = await getRelations(vault, slug).catch(() => ({
      project: slug,
      edges: [],
      summary: {},
      unknownTypes: [],
    }));

    // Fetch metadata
    const metaRaw = await obEval(vault, buildMetaFetchExpr(slug)).catch(() => '');
    if (!metaRaw) {
      process.stderr.write('ERROR: sync-ontology: Obsidian not reachable or eval failed\n');
      process.exit(1);
    }

    const meta = parseJson<OntologyMeta>(metaRaw);
    if (!meta) {
      process.stderr.write('ERROR: sync-ontology: unexpected response from Obsidian\n');
      process.exit(1);
    }

    const edges = relResult.edges;
    const edgeCount = edges.length;
    const missingInverses = detectMissingInverses(edges).slice(0, 20);
    const avgEdges = edgeCount / Math.max(meta.noteCount, 1);

    // Update updated: date in ontology file
    await obEval(vault, buildUpdateDateExpr(slug)).catch(() => undefined);

    if (jsonOutput) {
      const result: OntologyResult = {
        entities: meta.entities,
        edges: edgeCount,
        missingInverses,
        incomplete: meta.incomplete,
      };
      process.stdout.write(JSON.stringify(result) + '\n');
      return;
    }

    // Human-readable report
    process.stdout.write(`=== Ontology Health Report: ${slug} ===\n\n`);

    process.stdout.write('--- Entity Distribution ---\n');
    for (const t of ['ROOT', 'BRANCH', 'LEAF']) {
      process.stdout.write(`  ${t}: ${meta.entities[t] ?? 0}\n`);
    }
    process.stdout.write('\n');

    if (Object.keys(meta.kinds).length > 0) {
      process.stdout.write('--- Kind Distribution ---\n');
      for (const [k, v] of Object.entries(meta.kinds).sort((a, b) => b[1] - a[1])) {
        process.stdout.write(`  ${k}: ${v}\n`);
      }
      process.stdout.write('\n');
    }

    if (Object.keys(meta.spines).length > 0) {
      process.stdout.write('--- Spine Distribution ---\n');
      for (const [s, v] of Object.entries(meta.spines).sort((a, b) => b[1] - a[1])) {
        process.stdout.write(`  ${s}: ${v}\n`);
      }
      process.stdout.write('\n');
    }

    if (Object.keys(meta.statuses).length > 0) {
      process.stdout.write('--- Status Distribution ---\n');
      for (const [st, v] of Object.entries(meta.statuses).sort((a, b) => b[1] - a[1])) {
        process.stdout.write(`  ${st}: ${v}\n`);
      }
      process.stdout.write('\n');
    }

    if (Object.keys(relResult.summary).length > 0) {
      process.stdout.write('--- Relationship Usage ---\n');
      for (const [r, c] of Object.entries(relResult.summary)) {
        process.stdout.write(`  ${r}: ${c}\n`);
      }
      process.stdout.write('\n');
    }

    if (missingInverses.length > 0) {
      process.stdout.write(`--- Missing Inverses (${missingInverses.length}) ---\n`);
      for (const mi of missingInverses.slice(0, 10)) {
        process.stdout.write(`  ${mi.source} --${mi.rel}-> ${mi.target} (no reverse edge)\n`);
      }
      if (missingInverses.length > 10) {
        process.stdout.write(`  ... and ${missingInverses.length - 10} more\n`);
      }
      process.stdout.write('\n');
    }

    process.stdout.write(
      `Total: ${meta.noteCount} notes, ${edgeCount} edges, avg ${avgEdges.toFixed(1)} edges/note, ${meta.incomplete} incomplete, ${missingInverses.length} missing inverses\n`
    );
  },
};

export default command;
