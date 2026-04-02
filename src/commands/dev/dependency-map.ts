/**
 * dependency-map — Dev skill: filter relationship graph to depends-on edges.
 *
 * Calls getRelations(), filters to depends-on edges only.
 * Outputs JSON (default) or GraphViz DOT format.
 */

import type { Command } from '../../cli';
import { resolveVault } from '../../lib/obsidian';
import type { CommandResult } from '../../types/result';
import { getRelations, type Edge } from '../cli-relations';
import { extractVaultFlag } from '../../lib/vault-registry';

export type DependencyFormat = 'json' | 'dot';

export interface DependencyEdge {
  source: string;
  target: string;
  context: string;
}

export interface DependencyMapData {
  project: string;
  edges: DependencyEdge[];
}

export function edgesToDot(project: string, edges: DependencyEdge[]): string {
  const lines = [`digraph ${project} {`];
  for (const e of edges) {
    const label = e.context ? ` [label="${e.context}"]` : '';
    lines.push(`  "${e.source}" -> "${e.target}"${label};`);
  }
  lines.push('}');
  return lines.join('\n');
}

export async function getDependencyMap(
  vault: string,
  project: string
): Promise<CommandResult<DependencyMapData>> {
  const relations = await getRelations(vault, project).catch(() => null);

  if (!relations) {
    return {
      ok: false,
      data: { project, edges: [] },
      error: 'dependency-map: getRelations failed or Obsidian not reachable',
    };
  }

  const edges: DependencyEdge[] = relations.edges
    .filter((e: Edge) => e.rel === 'depends-on')
    .map((e: Edge) => ({ source: e.source, target: e.target, context: e.context }));

  return { ok: true, data: { project, edges } };
}

const command: Command = {
  name: 'dev/dependency-map',
  description: 'Filter relationship graph to depends-on edges (JSON or DOT output)',

  async run(args: string[]): Promise<void> {
    let format: DependencyFormat = 'json';
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    const positional: string[] = [];

    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--format') {
        const fmt = rest[++i];
        if (fmt !== 'json' && fmt !== 'dot') {
          process.stderr.write(`ERROR: dependency-map: unknown format: ${fmt} (json|dot)\n`);
          process.exit(1);
        }
        format = fmt;
      } else {
        positional.push(rest[i]);
      }
    }

    if (positional.length < 1) {
      process.stderr.write(
        'Usage: nerv dev/dependency-map [--vault <name>] <project_slug> [--format json|dot]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const project = positional[0];

    const result = await getDependencyMap(vault, project);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    if (format === 'dot') {
      process.stdout.write(edgesToDot(project, result.data.edges) + '\n');
    } else {
      process.stdout.write(JSON.stringify(result.data) + '\n');
    }
  },
};

export default command;
