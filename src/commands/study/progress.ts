/**
 * progress — Study skill: study progress dashboard for a project.
 *
 * Returns note counts by status, completion %, word/edge metrics,
 * and notes modified in the last 7 days. Supports --format compact.
 */

import { encodeForJs, parseJson } from '../../lib/json';
import { obEval } from '../../lib/obsidian';
import type { CommandResult } from '../../types/result';
import { BaseCommand, type CommandContext } from '../base-command';

export interface ProgressData {
  project: string;
  notes: { total: number; stable: number; review: number; draft: number };
  completion: number;
  knowledge: { totalWords: number; totalEdges: number; avgEdgesPerNote: number };
  thisWeek: string[];
}

export async function getProgress(
  vault: string,
  project: string
): Promise<CommandResult<ProgressData>> {
  const jsSlug = encodeForJs(project);

  const raw = await obEval(
    vault,
    `(async () => {
  var slug       = ${jsSlug};
  var projDir    = 'projects/' + slug;
  var oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  var total = 0, stable = 0, review = 0, draft = 0;
  var totalWords = 0, totalEdges = 0;
  var thisWeek   = [];

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var body  = await app.vault.cachedRead(f);
    var bt    = body.replace(/^---[\\s\\S]*?---\\n?/, '');

    total++;

    var status = String(fm.status || 'draft');
    if (status === 'stable')      stable++;
    else if (status === 'review') review++;
    else                          draft++;

    totalWords += bt.trim().split(/\\s+/).filter(Boolean).length;
    totalEdges += (body.match(/^- [a-z][a-z0-9-]* :: \\[\\[/gm) || []).length;

    if (f.stat && f.stat.mtime > oneWeekAgo) {
      thisWeek.push(f.basename);
    }
  }

  var completion = total > 0 ? Math.round((stable / total * 100) * 10) / 10 : 0;
  var avgEdges   = total > 0 ? Math.round((totalEdges / total) * 10) / 10 : 0;

  return JSON.stringify({
    project:    slug,
    notes:      { total: total, stable: stable, review: review, draft: draft },
    completion: completion,
    knowledge:  { totalWords: totalWords, totalEdges: totalEdges, avgEdgesPerNote: avgEdges },
    thisWeek:   thisWeek
  });
})()`
  ).catch(() => '');

  const empty: ProgressData = {
    project,
    notes: { total: 0, stable: 0, review: 0, draft: 0 },
    completion: 0,
    knowledge: { totalWords: 0, totalEdges: 0, avgEdgesPerNote: 0 },
    thisWeek: [],
  };

  if (!raw) {
    return { ok: false, data: empty, error: 'progress: Obsidian not reachable or eval failed' };
  }

  const data = parseJson<ProgressData>(raw);
  if (!data) {
    return { ok: false, data: empty, error: 'progress: invalid JSON from eval' };
  }

  return { ok: true, data };
}

class ProgressCommand extends BaseCommand {
  readonly name = 'study/progress';
  readonly description = 'Study progress dashboard for a project';
  readonly usage = 'nerv study/progress [--vault <name>] <project_slug> [--format compact]';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    let format = 'json';
    const positional: string[] = [];

    for (let i = 0; i < ctx.positional.length; i++) {
      if (ctx.positional[i] === '--format') {
        format = ctx.positional[++i] ?? 'json';
      } else {
        positional.push(ctx.positional[i]);
      }
    }

    const project = positional[0];
    const result = await getProgress(ctx.vault, project);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    const d = result.data;
    if (format === 'compact') {
      process.stdout.write(
        `${project}: ${d.notes.total} notes, ${d.completion}% stable, ${d.knowledge.totalEdges} edges\n`
      );
    } else {
      process.stdout.write(JSON.stringify(d) + '\n');
    }
  }
}

export default new ProgressCommand();
