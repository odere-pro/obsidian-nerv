/**
 * dependency-map — Dev skill: filter relationship graph to depends-on edges.
 *
 * Calls getRelations(), filters to depends-on edges only.
 * Outputs JSON (default) or GraphViz DOT format.
 */

import { BaseCommand, type CommandContext } from '../base-command';
import type { CommandResult } from '../../types/result';
import { getRelations, type Edge } from '../cli-relations';

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

class DependencyMapCommand extends BaseCommand {
  readonly name = 'dev/dependency-map';
  readonly description = 'Filter relationship graph to depends-on edges (JSON or DOT output)';
  readonly usage = 'nerv dev/dependency-map [--vault <name>] <project_slug> [--format json|dot]';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    let format: DependencyFormat = 'json';
    const positional: string[] = [];

    for (let i = 0; i < ctx.positional.length; i++) {
      if (ctx.positional[i] === '--format') {
        const fmt = ctx.positional[++i];
        if (fmt !== 'json' && fmt !== 'dot') {
          ctx.out.error(`dependency-map: unknown format: ${fmt} (json|dot)`);
        }
        format = fmt;
      } else {
        positional.push(ctx.positional[i]);
      }
    }

    if (positional.length < 1) {
      ctx.out.error(`Usage: ${this.usage}`);
    }

    const project = positional[0];
    const result = await getDependencyMap(ctx.vault, project);

    if (!result.ok) {
      ctx.out.error(result.error);
    }

    if (format === 'dot') {
      process.stdout.write(edgesToDot(project, result.data.edges) + '\n');
    } else {
      process.stdout.write(JSON.stringify(result.data) + '\n');
    }
  }
}

export default new DependencyMapCommand();
