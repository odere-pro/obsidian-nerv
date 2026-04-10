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

import { isEntityNote } from '../constants/limits';
import { logWarn } from '../lib/logger';
import { getVaultOps } from '../ports/provider';
import type { VaultOps } from '../ports/vault-ops';
import { Slug } from '../types/slug';
import { getRelations } from './cli-relations';

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

const REQUIRED = ['title', 'type', 'kind', 'spine', 'status'];

function fetchMeta(
  entries: { path: string; frontmatter: Record<string, unknown> }[]
): OntologyMeta {
  const notes = entries.filter(e => {
    const name = e.path.split('/').pop() ?? '';
    return isEntityNote(name);
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
export async function syncOntology(
  vault: string,
  slug: string,
  injectedOps?: VaultOps
): Promise<OntologyResult> {
  const ops = injectedOps ?? getVaultOps();

  const relResult = await getRelations(vault, slug, ops).catch(() => ({
    project: slug,
    edges: [],
    summary: {},
    unknownTypes: [],
  }));

  const allFiles = await ops.listFiles(vault, { folder: `projects/${slug}` });
  const meta = fetchMeta(allFiles);
  if (meta.noteCount === 0) throw new Error('sync-ontology: no notes found or vault not reachable');

  const edges = relResult.edges;
  const missingInverses = detectMissingInverses(edges).slice(0, 20);

  const ontoPath = `projects/${slug}/_ontology.${slug}.md`;
  const today = new Date().toISOString().split('T')[0];
  if (allFiles.some(e => e.path === ontoPath)) {
    await ops.updateFrontmatter(vault, ontoPath, { updated: today }).catch(() => {
      logWarn('sync-ontology: failed to update ontology frontmatter date');
    });
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

import { BaseCommand, type CommandContext } from './base-command';

class SyncOntologyCommand extends BaseCommand {
  readonly name = 'sync-ontology';
  readonly description = 'Produce ontology health report for a project';
  readonly usage = 'nerv sync-ontology [--vault <name>] <project_slug> [--json]';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    const slug = ctx.positional[0];

    if (!Slug.PATTERN.test(slug)) {
      ctx.out.error(
        `sync-ontology: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    const ops = getVaultOps();

    const relResult = await getRelations(ctx.vault, slug).catch(() => ({
      project: slug,
      edges: [] as { source: string; target: string; rel: string; context: string }[],
      summary: {} as Record<string, number>,
      unknownTypes: [] as string[],
    }));

    const allFiles = await ops.listFiles(ctx.vault, { folder: `projects/${slug}` });
    const meta = fetchMeta(allFiles);
    if (meta.noteCount === 0) {
      ctx.out.error('sync-ontology: no notes found or vault not reachable');
    }

    const edges = relResult.edges;
    const edgeCount = edges.length;
    const missingInverses = detectMissingInverses(edges).slice(0, 20);
    const avgEdges = edgeCount / Math.max(meta.noteCount, 1);

    const ontoPath = `projects/${slug}/_ontology.${slug}.md`;
    const today = new Date().toISOString().split('T')[0];
    if (allFiles.some(e => e.path === ontoPath)) {
      await ops.updateFrontmatter(ctx.vault, ontoPath, { updated: today }).catch(() => {
        logWarn('sync-ontology: failed to update ontology frontmatter date');
      });
    }

    if (ctx.jsonOutput) {
      ctx.out.success({
        entities: meta.entities,
        edges: edgeCount,
        missingInverses,
        incomplete: meta.incomplete,
      } satisfies OntologyResult);
      return;
    }

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
  }
}

export default new SyncOntologyCommand();
