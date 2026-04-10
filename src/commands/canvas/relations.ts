/**
 * canvas/relations — Generate a JSON Canvas relations graph from project connections.
 *
 * Reads relationship edges via getRelations().
 * Outputs projects/<slug>/<slug>.relations.canvas conforming to JSON Canvas 1.0 spec.
 *
 * Edge colors:
 *   parent-of → blue (#4488FF), depends-on → purple (#9955FF),
 *   related-to → gray (#888888), triggers → green (#44BB44),
 *   implements → orange (#FF8800)
 *
 * Exports:
 *   - CanvasResult (re-export from lib/canvas)
 *   - generateRelationsCanvas(vault, project) — programmatic API
 *   - default Command — CLI entry point
 */

import type { Command } from '../../cli';
import {
  deterministicEdgeId,
  deterministicHexId,
  EDGE_COLORS,
  NODE_GAP_X,
  NODE_GAP_Y,
  NODE_H,
  NODE_W,
  type CanvasData,
  type CanvasEdge,
  type CanvasNode,
  type CanvasResult,
} from '../../lib/canvas';
import { buildWriteExpr } from '../../lib/canvas-codegen';
import { obEval, resolveVault } from '../../lib/obsidian';
import { getRelations, type Edge } from '../cli-relations';
import { extractVaultFlag } from '../../lib/vault-registry';

export type { CanvasResult };

/* ---------------------------------------------------------------------------
 * Pure canvas builder
 * --------------------------------------------------------------------------- */

export interface RelationsInput {
  noteNames: string[];
  edges: Edge[];
}

/**
 * Build a relations canvas from a flat list of note names and typed edges.
 * Uses a simple grid layout to minimize edge crossings.
 */
export function buildRelationsCanvas(input: RelationsInput): CanvasData {
  const { noteNames, edges } = input;

  /* Collect all unique note names (sources + targets + explicit noteNames) */
  const allNames = new Set(noteNames);
  for (const e of edges) {
    allNames.add(e.source);
    allNames.add(e.target);
  }
  const names = [...allNames].sort();

  /* Grid layout: fill columns first (up to COLS_PER_ROW per row) */
  const COLS = Math.max(1, Math.ceil(Math.sqrt(names.length)));
  const nodeMap = new Map<string, CanvasNode>();

  names.forEach((name, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const id = deterministicHexId(name, 'relations');
    nodeMap.set(name, {
      id,
      type: 'text',
      text: name,
      x: col * NODE_GAP_X,
      y: row * NODE_GAP_Y,
      width: NODE_W,
      height: NODE_H,
    });
  });

  const canvasEdges: CanvasEdge[] = [];
  for (const e of edges) {
    const fromNode = nodeMap.get(e.source);
    const toNode = nodeMap.get(e.target);
    if (!fromNode || !toNode) continue;

    const edgeId = deterministicEdgeId(fromNode.id, toNode.id, e.rel);
    const color = EDGE_COLORS[e.rel] ?? '#888888';

    canvasEdges.push({
      id: edgeId,
      fromNode: fromNode.id,
      fromSide: 'right',
      toNode: toNode.id,
      toSide: 'left',
      toEnd: 'arrow',
      label: e.rel,
      color,
    });
  }

  return { nodes: [...nodeMap.values()], edges: canvasEdges };
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

export async function generateRelationsCanvas(
  vault: string,
  project: string
): Promise<CanvasResult> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
    return {
      ok: false,
      data: { nodes: [], edges: [] },
      outputPath: '',
      error: `canvas:relations: invalid project slug '${project}'`,
    };
  }

  const relations = await getRelations(vault, project).catch(() => null);

  if (!relations) {
    return {
      ok: false,
      data: { nodes: [], edges: [] },
      outputPath: '',
      error: 'canvas:relations: getRelations failed or Obsidian not reachable',
    };
  }

  const canvas = buildRelationsCanvas({ noteNames: [], edges: relations.edges });
  const outputPath = `projects/${project}/${project}.relations.canvas`;
  const content = JSON.stringify(canvas, null, 2);

  await obEval(vault, buildWriteExpr(outputPath, content)).catch(() => undefined);

  return { ok: true, data: canvas, outputPath };
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

const command: Command = {
  name: 'canvas/relations',
  description: 'Generate a JSON Canvas relations graph from project connections',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 1) {
      process.stderr.write('Usage: nerv canvas/relations [--vault <name>] <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const project = rest[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
      process.stderr.write(
        'ERROR: canvas:relations: project slug must be lowercase alphanumeric with hyphens\n'
      );
      process.exit(1);
    }

    const result = await generateRelationsCanvas(vault, project);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    process.stdout.write(
      `canvas:relations written to ${result.outputPath} (${result.data.nodes.length} nodes, ${result.data.edges.length} edges)\n`
    );
  },
};

export default command;
