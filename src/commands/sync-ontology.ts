/**
 * sync-ontology — Autonomic skill: produce ontology health report for a project.
 *
 * Scans ## Connections sections, compares rel-types against _ontology.<slug>.md,
 * reports entity distribution, relationship usage, missing inverses, and unknown types.
 * Calls getRelations() directly (no subprocess) for edge data.
 *
 * JSON schema (--json):
 *   {"entities":{"ROOT":N,"BRANCH":N,"LEAF":N},
 *    "edges":M,"missingInverses":[{"source":"...","rel":"...","target":"..."}],
 *    "incomplete":P}
 *
 * Idempotent: updates `updated:` date in ontology artifact file on every run.
 */

import type { Command } from '../cli';
import { logError } from '../lib/logger';
import { resolveVault } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import { getRelations } from './cli-relations';
import { extractVaultFlag } from '../lib/vault-registry';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
 * Missing inverse detection — pure function
 * --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
 * VaultOps data fetch
 * --------------------------------------------------------------------------- */

const EXCLUDED_PREFIXES = ['_vocab', '_topk', '_ontology', 'tpl-'];
const REQUIRED = ['title', 'type', 'kind', 'spine', 'status'];

function fetchMeta(
  entries: { path: string; frontmatter: Record<string, unknown> }[],
  slug: string
): OntologyMeta {
  const projDir = `projects/${slug}`;
  const notes = entries.filter(e => {
    if (!e.path.startsWith(projDir + '/')) return false;
    const name = e.path.split('/').pop() ?? '';
    return !EXCLUDED_PREFIXES.some(p => name.startsWith(p));
  });

  const entities: Record<string, number> = { ROOT: 0, BRANCH: 0, LEAF: 0 };
  const kinds: Record<string, number> = {};
  const spines: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  let incomplete = 0;

  for (const n of notes) {
    const fm = n.frontmatter;
    const type = fm.type ? String(fm.type) : 'LEAF';
    const kind = fm.kind ? String(fm.kind) : '';
    const spine = fm.spine ? String(fm.spine) : '';
    const status = fm.status ? String(fm.status) : 'draft';

    if (entities[type] !== undefined) entities[type]++;
    else entities[type] = 1;
    if (kind) kinds[kind] = (kinds[kind] ?? 0) + 1;
    if (spine) spines[spine] = (spines[spine] ?? 0) + 1;
    statuses[status] = (statuses[status] ?? 0) + 1;

    const missing = REQUIRED.some(k => {
      const v = fm[k];
      return v === undefined || v === null || v === '';
    });
    if (missing) incomplete++;
  }

  return { noteCount: notes.length, entities, kinds, spines, statuses, incomplete };
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

/** Run ontology health analysis for a project. Used by weekly-review. */
export async function syncOntology(vault: string, slug: string): Promise<OntologyResult> {
  const ops = getVaultOps();

  const relResult = await getRelations(vault, slug).catch(() => ({
    project: slug,
    edges: [],
    summary: {},
    unknownTypes: [],
  }));

  const allFiles = await ops.listFiles(vault);
  const meta = fetchMeta(allFiles, slug);
  if (meta.noteCount === 0) throw new Error('sync-ontology: no notes found or vault not reachable');

  const edges = relResult.edges;
  const missingInverses = detectMissingInverses(edges).slice(0, 20);

  const ontoPath = `projects/${slug}/_ontology.${slug}.md`;
  const today = new Date().toISOString().split('T')[0];
  if (allFiles.some(e => e.path === ontoPath)) {
    await ops.updateFrontmatter(vault, ontoPath, { updated: today }).catch(() => undefined);
  }

  return {
    entities: meta.entities,
    edges: edges.length,
    missingInverses,
    incomplete: meta.incomplete,
  };
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

const command: Command = {
  name: 'sync-ontology',
  description: 'Produce ontology health report for a project',

  async run(args: string[]): Promise<void> {
    let jsonOutput = false;
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];
    for (const a of rest) {
      if (a === '--json') jsonOutput = true;
      else positional.push(a);
    }

    if (positional.length < 1) {
      process.stderr.write('Usage: nerv sync-ontology [--vault <name>] <project_slug> [--json]\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const slug = positional[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      logError(
        `sync-ontology: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    const ops = getVaultOps();

    /* Fetch relations via getRelations (no subprocess) */
    const relResult = await getRelations(vault, slug).catch(() => ({
      project: slug,
      edges: [],
      summary: {},
      unknownTypes: [],
    }));

    /* Fetch metadata via VaultOps */
    const allFiles = await ops.listFiles(vault);
    const meta = fetchMeta(allFiles, slug);
    if (meta.noteCount === 0) {
      process.stderr.write('ERROR: sync-ontology: no notes found or vault not reachable\n');
      process.exit(1);
    }

    const edges = relResult.edges;
    const edgeCount = edges.length;
    const missingInverses = detectMissingInverses(edges).slice(0, 20);
    const avgEdges = edgeCount / Math.max(meta.noteCount, 1);

    /* Update updated: date in ontology file */
    const ontoPath = `projects/${slug}/_ontology.${slug}.md`;
    const today = new Date().toISOString().split('T')[0];
    if (allFiles.some(e => e.path === ontoPath)) {
      await ops.updateFrontmatter(vault, ontoPath, { updated: today }).catch(() => undefined);
    }

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

    /* Human-readable report */
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
