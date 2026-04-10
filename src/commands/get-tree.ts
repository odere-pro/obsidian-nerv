/**
 * get-tree — Sensory skill: hierarchical project tree from parent/children relationships.
 *
 * Exports:
 *   - TreeNode, MissingNode, CycleNode, AnyTreeNode, TreeResult (types)
 *   - buildTree(nodes, maxDepth) — pure tree-construction function, zero side effects
 *   - getTree(vault, slug, maxDepth) — programmatic API
 *   - default Command — CLI entry point
 */

import { BaseCommand, type CommandContext } from './base-command';
import { encodeForJs, parseJson } from '../lib/json';
import { obEval } from '../lib/obsidian';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface TreeNode {
  path: string;
  title: string;
  type: string;
  kind: string;
  status: string;
  subtree: AnyTreeNode[];
}

export interface MissingNode {
  missing: string;
}

export interface CycleNode {
  cycle: string;
}

export type AnyTreeNode = TreeNode | MissingNode | CycleNode;

export interface TreeResult {
  folder: string;
  nodeCount: number;
  tree: TreeNode[];
}

/** Flat note representation used by buildTree. */
export interface FlatNote {
  path: string;
  basename: string;
  title: string;
  type: string;
  kind: string;
  status: string;
  children: string[];
}

/* ---------------------------------------------------------------------------
 * Pure tree builder
 * --------------------------------------------------------------------------- */

function resolveWikiLink(raw: string): string {
  const m = String(raw ?? '').match(/\[\[([^\]#|]+)/);
  return m ? m[1].trim() : String(raw ?? '').trim();
}

function buildNodeRecursive(
  note: FlatNote,
  noteMap: Map<string, FlatNote>,
  visited: Set<string>,
  depth: number,
  maxDepth: number
): TreeNode {
  const node: TreeNode = {
    path: note.path,
    title: note.title,
    type: note.type,
    kind: note.kind,
    status: note.status,
    subtree: [],
  };

  if (depth >= maxDepth) return node;

  for (const rawChild of note.children) {
    const childName = resolveWikiLink(rawChild);
    if (!childName) continue;

    const childNote = noteMap.get(childName);
    if (!childNote) {
      node.subtree.push({ missing: childName });
      continue;
    }
    if (visited.has(childNote.path)) {
      node.subtree.push({ cycle: childNote.path });
      continue;
    }
    const childVisited = new Set(visited);
    childVisited.add(childNote.path);
    node.subtree.push(buildNodeRecursive(childNote, noteMap, childVisited, depth + 1, maxDepth));
  }

  return node;
}

/**
 * Build the hierarchical tree from a flat list of notes.
 *
 * Pure function — no I/O, no Obsidian required.
 * Roots are notes with type === 'ROOT'. Children are resolved by basename.
 */
export function buildTree(notes: FlatNote[], maxDepth = 50): TreeResult {
  const noteMap = new Map<string, FlatNote>();
  for (const n of notes) noteMap.set(n.basename, n);

  const folder = notes.length > 0 ? notes[0].path.split('/').slice(0, -1).join('/') : '';
  let nodeCount = 0;

  const rootNotes = notes.filter(n => n.type === 'ROOT');
  const tree: TreeNode[] = rootNotes.map(root => {
    const visited = new Set<string>([root.path]);
    const node = buildNodeRecursive(root, noteMap, visited, 0, maxDepth);
    /* Count all nodes in this subtree */
    const countNodes = (n: AnyTreeNode): number => {
      if ('missing' in n || 'cycle' in n) return 1;
      return 1 + n.subtree.reduce((s, c) => s + countNodes(c), 0);
    };
    nodeCount += countNodes(node);
    return node;
  });

  return { folder, nodeCount, tree };
}

/* ---------------------------------------------------------------------------
 * Obsidian data fetch
 * --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
 * Programmatic API
 * --------------------------------------------------------------------------- */

export async function getTree(vault: string, slug: string, maxDepth = 50): Promise<TreeResult> {
  const raw = await obEval(vault, buildFetchExpr(slug)).catch(() => '[]');
  const notes = parseJson<FlatNote[]>(raw) ?? [];

  const result = buildTree(notes, maxDepth);
  /* Override folder to canonical form */
  return { ...result, folder: `projects/${slug}` };
}

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

class GetTreeCommand extends BaseCommand {
  readonly name = 'get-tree';
  readonly description = 'Return the hierarchical note tree for a project';
  readonly usage = 'nerv get-tree [--vault <name>] <project_slug> [--depth N]';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    let maxDepth = 50;
    const filtered: string[] = [];

    for (let i = 0; i < ctx.positional.length; i++) {
      if (ctx.positional[i] === '--depth') {
        const d = parseInt(ctx.positional[++i] ?? '', 10);
        if (isNaN(d) || d < 1) {
          process.stderr.write('ERROR: get-tree: --depth requires a positive integer\n');
          process.exit(1);
        }
        maxDepth = d;
      } else {
        filtered.push(ctx.positional[i]);
      }
    }

    const slug = filtered[0];

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      process.stderr.write(
        'ERROR: get-tree: project slug must be lowercase alphanumeric with hyphens\n'
      );
      process.exit(1);
    }

    const result = await getTree(ctx.vault, slug, maxDepth);
    process.stdout.write(JSON.stringify(result) + '\n');
  }
}

export default new GetTreeCommand();
