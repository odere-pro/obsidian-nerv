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
  noteCount: number;
  entities: Record<string, number>;
  kinds: Record<string, number>;
  spines: Record<string, number>;
  statuses: Record<string, number>;
  edges: number;
  relSummary: Record<string, number>;
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
    noteCount: meta.noteCount,
    entities: meta.entities,
    kinds: meta.kinds,
    spines: meta.spines,
    statuses: meta.statuses,
    edges: edges.length,
    relSummary: relResult.summary,
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
      return ctx.out.error(
        `sync-ontology: project slug must be lowercase alphanumeric with hyphens (got: ${slug})`
      );
    }

    const result = await syncOntology(ctx.vault, slug, ctx.ops);

    if (ctx.jsonOutput) {
      ctx.out.success(result);
      return;
    }

    const {
      noteCount,
      entities,
      kinds,
      spines,
      statuses,
      edges,
      relSummary,
      missingInverses,
      incomplete,
    } = result;
    const avgEdges = edges / Math.max(noteCount, 1);

    const lines: string[] = [`=== Ontology Health Report: ${slug} ===`, ''];

    lines.push('--- Entity Distribution ---');
    for (const t of ['ROOT', 'BRANCH', 'LEAF']) {
      lines.push(`  ${t}: ${entities[t] ?? 0}`);
    }
    lines.push('');

    if (Object.keys(kinds).length > 0) {
      lines.push('--- Kind Distribution ---');
      for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${k}: ${v}`);
      }
      lines.push('');
    }

    if (Object.keys(spines).length > 0) {
      lines.push('--- Spine Distribution ---');
      for (const [s, v] of Object.entries(spines).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${s}: ${v}`);
      }
      lines.push('');
    }

    if (Object.keys(statuses).length > 0) {
      lines.push('--- Status Distribution ---');
      for (const [st, v] of Object.entries(statuses).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${st}: ${v}`);
      }
      lines.push('');
    }

    if (Object.keys(relSummary).length > 0) {
      lines.push('--- Relationship Usage ---');
      for (const [r, c] of Object.entries(relSummary)) {
        lines.push(`  ${r}: ${c}`);
      }
      lines.push('');
    }

    if (missingInverses.length > 0) {
      lines.push(`--- Missing Inverses (${missingInverses.length}) ---`);
      for (const mi of missingInverses.slice(0, 10)) {
        lines.push(`  ${mi.source} --${mi.rel}-> ${mi.target} (no reverse edge)`);
      }
      if (missingInverses.length > 10) {
        lines.push(`  ... and ${missingInverses.length - 10} more`);
      }
      lines.push('');
    }

    lines.push(
      `Total: ${noteCount} notes, ${edges} edges, avg ${avgEdges.toFixed(1)} edges/note, ${incomplete} incomplete, ${missingInverses.length} missing inverses`
    );

    ctx.out.success(lines.join('\n'));
  }
}

export default new SyncOntologyCommand();
