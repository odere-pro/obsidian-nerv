// canvas/tree — Generate a JSON Canvas tree from project hierarchy.
//
// Reads ROOT/BRANCH/LEAF note hierarchy via getTree().
// Outputs projects/<slug>/<slug>.tree.canvas conforming to JSON Canvas 1.0 spec.
//
// Exports:
//   - CanvasResult (re-export from lib/canvas)
//   - generateTreeCanvas(vault, project) — programmatic API
//   - default Command — CLI entry point

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
import { encodeForJs, parseJson } from '../../lib/json';
import { obEval, resolveVault } from '../../lib/obsidian';
import { buildTree, type FlatNote, type TreeNode } from '../get-tree';

export type { CanvasResult };

// ---------------------------------------------------------------------------
// Node color by note type
// ---------------------------------------------------------------------------

function nodeColor(type: string): string {
  if (type === 'ROOT') return '1'; // Red
  if (type === 'BRANCH') return '2'; // Orange
  return '3'; // Yellow (LEAF and others)
}

// ---------------------------------------------------------------------------
// Pure canvas builder
// ---------------------------------------------------------------------------

interface NodePos {
  x: number;
  y: number;
}

/**
 * Traverse the tree and assign grid positions (depth × sibling).
 * Returns flat lists of nodes and edges for JSON Canvas output.
 */
export function buildTreeCanvas(treeNodes: TreeNode[]): CanvasData {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  // Track sibling index per depth level to compute y positions
  const siblingCounters: number[] = [];

  function visit(node: TreeNode, depth: number, parentId: string | null): NodePos {
    while (siblingCounters.length <= depth) siblingCounters.push(0);

    const siblingIndex = siblingCounters[depth];
    siblingCounters[depth]++;

    const x = depth * NODE_GAP_X;
    const y = siblingIndex * NODE_GAP_Y;
    const id = deterministicHexId(node.path, 'tree');

    nodes.push({
      id,
      type: 'text',
      text: node.title || node.path,
      x,
      y,
      width: NODE_W,
      height: NODE_H,
      color: nodeColor(node.type),
    });

    if (parentId !== null) {
      const edgeId = deterministicEdgeId(parentId, id, 'tree');
      edges.push({
        id: edgeId,
        fromNode: parentId,
        fromSide: 'bottom',
        toNode: id,
        toSide: 'top',
        toEnd: 'arrow',
      });
    }

    for (const child of node.subtree) {
      if (!('missing' in child) && !('cycle' in child)) {
        visit(child as TreeNode, depth + 1, id);
      }
    }

    return { x, y };
  }

  for (const root of treeNodes) {
    visit(root, 0, null);
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Obsidian data fetch (same expression as get-tree)
// ---------------------------------------------------------------------------

function buildFetchExpr(slug: string): string {
  const jsSlug = encodeForJs(slug);
  return `(function() {
  var slug    = ${jsSlug};
  var projDir = 'projects/' + slug;
  var allFiles = app.vault.getMarkdownFiles().filter(function(f) {
    return f.path.startsWith(projDir + '/');
  });
  var notes = allFiles.map(function(f) {
    var cache = app.metadataCache.getFileCache(f);
    var fm = (cache && cache.frontmatter) ? cache.frontmatter : {};
    return {
      path:     f.path,
      basename: f.basename,
      title:    String(fm.title   || f.basename),
      type:     String(fm.type    || ''),
      kind:     String(fm.kind    || ''),
      status:   String(fm.status  || ''),
      children: [].concat(fm.children || []).map(String)
    };
  });
  return JSON.stringify(notes);
})()`;
}

// ---------------------------------------------------------------------------
// Canvas write helper (via obEval)
// ---------------------------------------------------------------------------

function buildWriteExpr(vault: string, filePath: string, content: string): string {
  const jsPath = encodeForJs(filePath);
  const jsContent = encodeForJs(content);
  return `(async () => {
  var path = ${jsPath};
  var content = ${jsContent};
  var existing = app.vault.getAbstractFileByPath(path);
  if (existing) {
    await app.vault.modify(existing, content);
  } else {
    // Ensure parent folder exists
    var parts = path.split('/');
    parts.pop();
    var dir = parts.join('/');
    var dirFile = app.vault.getAbstractFileByPath(dir);
    if (!dirFile) await app.vault.createFolder(dir);
    await app.vault.create(path, content);
  }
})()`;
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

export async function generateTreeCanvas(vault: string, project: string): Promise<CanvasResult> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
    return {
      ok: false,
      data: { nodes: [], edges: [] },
      outputPath: '',
      error: `canvas:tree: invalid project slug '${project}'`,
    };
  }

  const raw = await obEval(vault, buildFetchExpr(project)).catch(() => '[]');
  const notes = parseJson<FlatNote[]>(raw) ?? [];
  const treeResult = buildTree(notes);
  const canvas = buildTreeCanvas(treeResult.tree);

  const outputPath = `projects/${project}/${project}.tree.canvas`;
  const content = JSON.stringify(canvas, null, 2);

  await obEval(vault, buildWriteExpr(vault, outputPath, content)).catch(() => undefined);

  return { ok: true, data: canvas, outputPath };
}

// ---------------------------------------------------------------------------
// CLI Command
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'canvas/tree',
  description: 'Generate a JSON Canvas tree from project hierarchy (ROOT → BRANCH → LEAF)',

  async run(args: string[]): Promise<void> {
    if (args.length < 2) {
      process.stderr.write('Usage: nerv canvas/tree <vault> <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(args[0]);
    const project = args[1];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(project)) {
      process.stderr.write(
        'ERROR: canvas/tree: project slug must be lowercase alphanumeric with hyphens\n'
      );
      process.exit(1);
    }

    const result = await generateTreeCanvas(vault, project);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    process.stdout.write(
      `canvas:tree written to ${result.outputPath} (${result.data.nodes.length} nodes, ${result.data.edges.length} edges)\n`
    );
  },
};

export default command;
