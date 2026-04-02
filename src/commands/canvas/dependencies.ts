/**
 * canvas/dependencies — Generate a JSON Canvas DAG for depends-on edges.
 *
 * Filters to depends-on edges only from getRelations().
 * Lays out nodes using topological ordering: sources on left, sinks on right.
 * Outputs projects/<slug>/<slug>.dependencies.canvas conforming to JSON Canvas 1.0 spec.
 *
 * Node coloring:
 *   no dependencies (pure sink)  → "3" Yellow
 *   has dependencies (has deps)  → "2" Orange
 *   is depended-on (pure source) → "1" Red
 *
 * Exports:
 *   - CanvasResult (re-export from lib/canvas)
 *   - buildDependenciesCanvas(edges) — pure function
 *   - generateDependenciesCanvas(vault, project) — programmatic API
 *   - default Command — CLI entry point
 */

import type { Command } from '../../cli';
import {
  type CanvasData,
  type CanvasEdge,
  type CanvasNode,
  type CanvasResult,
  deterministicEdgeId,
  deterministicHexId,
  NODE_GAP_X,
  NODE_GAP_Y,
  NODE_H,
  NODE_W,
} from '../../lib/canvas';
import { encodeForJs } from '../../lib/json';
import { obEval, resolveVault } from '../../lib/obsidian';
import { getRelations } from '../cli-relations';
import { extractVaultFlag } from '../../lib/vault-registry';

export type { CanvasResult };

/* ---------------------------------------------------------------------------
 * Topological sort (Kahn's algorithm)
 * --------------------------------------------------------------------------- */

/**
 * Assign a topological level (column) to each node.
 * Returns a map from node name → column index (0 = source/leftmost).
 * Falls back to insertion order if the graph has cycles.
 */
export function topologicalLevels(
  nodes: string[],
  edges: { source: string; target: string }[]
): Map<string, number> {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n, 0);
    adjacency.set(n, []);
  }

  for (const e of edges) {
    adjacency.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const levels = new Map<string, number>();
  const queue: string[] = [];

  for (const [n, deg] of inDegree) {
    if (deg === 0) queue.push(n);
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    const level = levels.get(node) ?? 0;
    levels.set(node, level);

    for (const neighbor of adjacency.get(node) ?? []) {
      const next = Math.max(levels.get(neighbor) ?? 0, level + 1);
      levels.set(neighbor, next);
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }

  /* Nodes that never entered the queue (cycle participants) get fallback level */
  let maxLevel = 0;
  for (const l of levels.values()) maxLevel = Math.max(maxLevel, l);

  for (const n of nodes) {
    if (!levels.has(n)) levels.set(n, maxLevel + 1);
  }

  return levels;
}

/* ---------------------------------------------------------------------------
 * Node color based on in/out degree
 * --------------------------------------------------------------------------- */

function dependencyColor(hasOutgoing: boolean, hasIncoming: boolean): string {
  if (hasIncoming && !hasOutgoing) return '1'; /* depended-on, pure source → Red */
  if (hasOutgoing) return '2'; /* has dependencies → Orange */
  return '3'; /* isolated / no deps → Yellow */
}

/* ---------------------------------------------------------------------------
 * Pure canvas builder
 * --------------------------------------------------------------------------- */

export interface DependencyEdgeInput {
  source: string;
  target: string;
}

/**
 * Build a dependencies canvas from a list of depends-on edges.
 * Positions nodes by topological level (sources left, sinks right).
 */
export function buildDependenciesCanvas(edges: DependencyEdgeInput[]): CanvasData {
  /* Collect all unique node names */
  const nameSet = new Set<string>();
  for (const e of edges) {
    nameSet.add(e.source);
    nameSet.add(e.target);
  }
  const names = [...nameSet].sort();

  if (names.length === 0) return { nodes: [], edges: [] };

  /* Compute in/out degree for coloring */
  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  for (const e of edges) {
    outgoing.add(e.source);
    incoming.add(e.target);
  }

  /* Topological levels for x-axis placement */
  const levels = topologicalLevels(names, edges);

  /* Count nodes per level for y-axis placement */
  const levelCounts = new Map<number, number>();
  for (const l of levels.values()) {
    levelCounts.set(l, (levelCounts.get(l) ?? 0) + 1);
  }

  /* Assign y positions by level */
  const levelYCounter = new Map<number, number>();
  const nodeMap = new Map<string, CanvasNode>();

  for (const name of names) {
    const level = levels.get(name) ?? 0;
    const yIndex = levelYCounter.get(level) ?? 0;
    levelYCounter.set(level, yIndex + 1);

    const id = deterministicHexId(name, 'dependencies');
    nodeMap.set(name, {
      id,
      type: 'text',
      text: name,
      x: level * NODE_GAP_X,
      y: yIndex * NODE_GAP_Y,
      width: NODE_W,
      height: NODE_H,
      color: dependencyColor(outgoing.has(name), incoming.has(name)),
    });
  }

  const canvasEdges: CanvasEdge[] = [];
  for (const e of edges) {
    const fromNode = nodeMap.get(e.source);
    const toNode = nodeMap.get(e.target);
    if (!fromNode || !toNode) continue;

    const edgeId = deterministicEdgeId(fromNode.id, toNode.id, 'depends-on');
    canvasEdges.push({
      id: edgeId,
      fromNode: fromNode.id,
      fromSide: 'right',
      toNode: toNode.id,
      toSide: 'left',
      toEnd: 'arrow',
      label: 'depends-on',
    });
  }

  return { nodes: [...nodeMap.values()], edges: canvasEdges };
}

/* ---------------------------------------------------------------------------
 * Canvas write helper (via obEval)
 * --------------------------------------------------------------------------- */

function buildWriteExpr(filePath: string, content: string): string {
  const jsPath = encodeForJs(filePath);
  const jsContent = encodeForJs(content);
  return `(async () => {
  var path = ${jsPath};
  var content = ${jsContent};
  var existing = app.vault.getAbstractFileByPath(path);
  if (existing) {
    await app.vault.modify(existing, content);
  } else {
    var parts = path.split('/');
    parts.pop();
    var dir = parts.join('/');
    var dirFile = app.vault.getAbstractFileByPath(dir);
    if (!dirFile) await app.vault.createFolder(dir);
    await app.vault.create(path, content);
  }
})()`;
}

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

export async function generateDependenciesCanvas(
  vault: string,
  project: string
): Promise<CanvasResult> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
    return {
      ok: false,
      data: { nodes: [], edges: [] },
      outputPath: '',
      error: `canvas:dependencies: invalid project slug '${project}'`,
    };
  }

  const relations = await getRelations(vault, project).catch(() => null);

  if (!relations) {
    return {
      ok: false,
      data: { nodes: [], edges: [] },
      outputPath: '',
      error: 'canvas:dependencies: getRelations failed or Obsidian not reachable',
    };
  }

  const depEdges = relations.edges
    .filter(e => e.rel === 'depends-on')
    .map(e => ({ source: e.source, target: e.target }));

  const canvas = buildDependenciesCanvas(depEdges);
  const outputPath = `projects/${project}/${project}.dependencies.canvas`;
  const content = JSON.stringify(canvas, null, 2);

  await obEval(vault, buildWriteExpr(outputPath, content)).catch(() => undefined);

  return { ok: true, data: canvas, outputPath };
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

const command: Command = {
  name: 'canvas/dependencies',
  description: 'Generate a JSON Canvas DAG of depends-on edges for a project',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 1) {
      process.stderr.write('Usage: nerv canvas/dependencies [--vault <name>] <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const project = rest[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
      process.stderr.write(
        'ERROR: canvas:dependencies: project slug must be lowercase alphanumeric with hyphens\n'
      );
      process.exit(1);
    }

    const result = await generateDependenciesCanvas(vault, project);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    process.stdout.write(
      `canvas:dependencies written to ${result.outputPath} (${result.data.nodes.length} nodes, ${result.data.edges.length} edges)\n`
    );
  },
};

export default command;
