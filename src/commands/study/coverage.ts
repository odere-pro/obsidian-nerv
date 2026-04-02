/**
 * coverage — Study skill: report spine-domain coverage for a project.
 *
 * Scans notes in a project, groups by spine frontmatter field,
 * computes coverage metrics (status distribution, coverage %).
 * Returns JSON output matching the Bash coverage.sh schema.
 */

import type { Command } from '../../cli';
import { encodeForJs, parseJson } from '../../lib/json';
import { obEval, resolveVault } from '../../lib/obsidian';
import type { CommandResult } from '../../types/result';
import { extractVaultFlag } from '../../lib/vault-registry';

export interface CoverageDomain {
  spine: string;
  total: number;
  stable: number;
  review: number;
  draft: number;
  coverage: number;
}

export interface CoverageData {
  project: string;
  domains: CoverageDomain[];
  overall: { totalNotes: number; avgCoverage: number };
}

export function computeCoverage(
  notes: Array<{ spine: string; status: string }>
): Omit<CoverageData, 'project'> {
  const domains: Record<string, CoverageDomain> = {};

  for (const note of notes) {
    const spine = note.spine || '__unspined__';
    const status = note.status || 'draft';

    if (!domains[spine]) {
      domains[spine] = { spine, total: 0, stable: 0, review: 0, draft: 0, coverage: 0 };
    }
    domains[spine].total++;
    if (status === 'stable') domains[spine].stable++;
    else if (status === 'review') domains[spine].review++;
    else domains[spine].draft++;
  }

  const domainList = Object.keys(domains)
    .sort()
    .map(k => {
      const d = domains[k];
      const coverage = d.total > 0 ? Math.round((d.stable / d.total) * 100 * 10) / 10 : 0;
      return { ...d, coverage };
    });

  const totalNotes = notes.length;
  const totalStable = domainList.reduce((s, d) => s + d.stable, 0);
  const avgCoverage = totalNotes > 0 ? Math.round((totalStable / totalNotes) * 100 * 10) / 10 : 0;

  return { domains: domainList, overall: { totalNotes, avgCoverage } };
}

export async function getCoverage(
  vault: string,
  project: string
): Promise<CommandResult<CoverageData>> {
  const jsSlug = encodeForJs(project);

  const raw = await obEval(
    vault,
    `(function() {
  var slug    = ${jsSlug};
  var projDir = 'projects/' + slug;

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    return !n.startsWith('_vocab')    &&
           !n.startsWith('_topk')     &&
           !n.startsWith('_ontology') &&
           !n.startsWith('tpl-');
  });

  var domains = {};

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var spine  = String(fm.spine  || '__unspined__');
    var status = String(fm.status || 'draft');

    if (!domains[spine]) {
      domains[spine] = { spine: spine, total: 0, stable: 0, review: 0, draft: 0 };
    }
    domains[spine].total++;
    if (status === 'stable')      domains[spine].stable++;
    else if (status === 'review') domains[spine].review++;
    else                          domains[spine].draft++;
  }

  var domainList = Object.keys(domains).sort().map(function(k) {
    var d   = domains[k];
    var cov = d.total > 0
      ? Math.round((d.stable / d.total * 100) * 10) / 10
      : 0;
    return { spine: d.spine, total: d.total, stable: d.stable,
             review: d.review, draft: d.draft, coverage: cov };
  });

  var totalNotes  = notes.length;
  var totalStable = domainList.reduce(function(s, d) { return s + d.stable; }, 0);
  var avgCoverage = totalNotes > 0
    ? Math.round((totalStable / totalNotes * 100) * 10) / 10
    : 0;

  return JSON.stringify({
    project: slug,
    domains: domainList,
    overall: { totalNotes: totalNotes, avgCoverage: avgCoverage }
  });
})()`
  ).catch(() => '');

  if (!raw) {
    return {
      ok: false,
      data: { project, domains: [], overall: { totalNotes: 0, avgCoverage: 0 } },
      error: 'coverage: Obsidian not reachable or eval failed',
    };
  }

  const data = parseJson<CoverageData>(raw);
  if (!data) {
    return {
      ok: false,
      data: { project, domains: [], overall: { totalNotes: 0, avgCoverage: 0 } },
      error: 'coverage: invalid JSON from eval',
    };
  }

  return { ok: true, data };
}

const command: Command = {
  name: 'study/coverage',
  description: 'Report spine-domain coverage metrics for a project',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 1) {
      process.stderr.write('Usage: nerv study/coverage [--vault <name>] <project_slug>\n');
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const project = rest[0];

    const result = await getCoverage(vault, project);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    process.stdout.write(JSON.stringify(result.data) + '\n');
  },
};

export default command;
