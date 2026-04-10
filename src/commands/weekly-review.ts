/**
 * weekly-review — Orchestration skill: run full vault health review.
 *
 * Composes 6 reflex/autonomic skills as direct module imports, plus
 * `obsidian unresolved` via spawnCapture (step 7).
 *
 * CRITICAL: ALL sub-command outputs are buffered before appending to the
 * daily note. A partial append followed by failure would corrupt the note.
 *
 * JSON schema (--json):
 *   {"lint":{"issues":N},"orphans":{"issues":N},"relations":{"unknown":N},
 *    "ontology":{"missingInverses":N},"unresolved":N}
 *
 * Exits 0 on all success; exits 1 with failing command name on stderr.
 */

import { logWarn } from '../lib/logger';
import { BaseCommand, type CommandContext } from './base-command';
import { dailyAppend } from '../lib/obsidian';
import { VaultSnapshot } from '../lib/vault-snapshot';
import { getVaultOps } from '../ports/provider';
import { spawnCapture } from '../lib/shell';
import { Slug } from '../types/slug';
import { lintProject } from './cli-lint';
import { findOrphans } from './cli-orphans';
import { getRelations } from './cli-relations';
import { syncOntology } from './sync-ontology';
import { syncTopk } from './sync-topk';
import { syncVocab } from './sync-vocab';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface WeeklyReviewResult {
  lint: { issues: number };
  orphans: { issues: number };
  relations: { unknown: number };
  ontology: { missingInverses: number };
  unresolved: number;
}

export interface WeeklyReviewDeps {
  lintProject: typeof lintProject;
  findOrphans: typeof findOrphans;
  getRelations: typeof getRelations;
  syncOntology: typeof syncOntology;
  syncVocab: typeof syncVocab;
  syncTopk: typeof syncTopk;
  spawnCapture: typeof spawnCapture;
  dailyAppend: typeof dailyAppend;
}

/* Note: Sub-command functions accept an optional VaultOps parameter.
 * weekly-review passes a shared VaultSnapshot to avoid redundant IPC. */

/* ---------------------------------------------------------------------------
 * Core orchestration — injectable deps for unit testing
 * --------------------------------------------------------------------------- */

export async function runWeeklyReview(
  vault: string,
  slug: string,
  jsonOutput: boolean,
  deps: WeeklyReviewDeps
): Promise<{ result: WeeklyReviewResult; failedCmd: string; topkViolations: number }> {
  const folder = `projects/${slug}`;
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const snapshot = new VaultSnapshot(getVaultOps());

  let lintIssues = 0;
  let orphanIssues = 0;
  let relUnknown = 0;
  let ontMissing = 0;
  let topkViolations = 0;
  let unresolvedCount = 0;
  let failedCmd = '';

  /* Step 1: lintProject */
  try {
    const r = await deps.lintProject(vault, folder, snapshot);
    lintIssues = r.count;
  } catch {
    if (!failedCmd) failedCmd = 'cli-lint';
  }

  /* Step 2: findOrphans */
  try {
    const r = await deps.findOrphans(vault, folder, snapshot);
    orphanIssues = r.count;
  } catch {
    if (!failedCmd) failedCmd = 'cli-orphans';
  }

  /* Step 3: getRelations */
  try {
    const r = await deps.getRelations(vault, slug, snapshot);
    relUnknown = r.unknownTypes.length;
  } catch {
    if (!failedCmd) failedCmd = 'cli-relations';
  }

  /* Step 4: syncOntology */
  try {
    const r = await deps.syncOntology(vault, slug, snapshot);
    ontMissing = r.missingInverses.length;
  } catch {
    if (!failedCmd) failedCmd = 'sync-ontology';
  }

  /* Step 5: syncVocab */
  try {
    await deps.syncVocab(vault, slug, snapshot);
  } catch {
    if (!failedCmd) failedCmd = 'sync-vocab';
  }

  /* Step 6: syncTopk */
  try {
    const r = await deps.syncTopk(vault, slug, snapshot);
    topkViolations = r.appended;
  } catch {
    if (!failedCmd) failedCmd = 'sync-topk';
  }

  /* Step 7: obsidian unresolved (graceful fallback on failure) */
  try {
    const { stdout, exitCode } = await deps.spawnCapture([
      'obsidian',
      'unresolved',
      `vault=${vault}`,
    ]);
    if (exitCode === 0) {
      unresolvedCount = (stdout.match(/\[\[/g) ?? []).length;
    }
  } catch {
    process.stderr.write('WARN: [weekly-review] obsidian unresolved unavailable, skipping\n');
  }

  const result: WeeklyReviewResult = {
    lint: { issues: lintIssues },
    orphans: { issues: orphanIssues },
    relations: { unknown: relUnknown },
    ontology: { missingInverses: ontMissing },
    unresolved: unresolvedCount,
  };

  if (!jsonOutput) {
    process.stdout.write(`[weekly-review] lint: ${lintIssues} issue(s)\n`);
    process.stdout.write(`[weekly-review] orphans: ${orphanIssues} issue(s)\n`);
    process.stdout.write(`[weekly-review] relations: ${relUnknown} unknown type(s)\n`);
    process.stdout.write(`[weekly-review] ontology: ${ontMissing} missing inverse(s)\n`);
    process.stdout.write(`[weekly-review] vocab: updated\n`);
    process.stdout.write(`[weekly-review] topk: ${topkViolations} overflow(s) appended\n`);
    process.stdout.write(`[weekly-review] unresolved: ${unresolvedCount} wikilink(s)\n`);

    /* Append summary to daily note only after ALL sub-commands have buffered results. */
    const summary = [
      '## Ontology Work Log',
      '',
      `- lint: ${lintIssues} issue(s)`,
      `- orphans: ${orphanIssues} issue(s)`,
      `- relations: ${relUnknown} unknown type(s)`,
      `- ontology: ${ontMissing} missing inverse(s)`,
      `- topk: ${topkViolations} overflow violation(s)`,
      `- unresolved: ${unresolvedCount} wikilink(s)`,
      `- Review complete: ${timestamp}`,
    ].join('\n');

    await deps.dailyAppend(vault, summary).catch(() => {
      logWarn('weekly-review: failed to append summary to daily');
    });
  }

  return { result, failedCmd, topkViolations };
}

/* ---------------------------------------------------------------------------
 * Real deps (used by CLI)
 * --------------------------------------------------------------------------- */

const REAL_DEPS: WeeklyReviewDeps = {
  lintProject,
  findOrphans,
  getRelations,
  syncOntology,
  syncVocab,
  syncTopk,
  spawnCapture,
  dailyAppend,
};

/* ---------------------------------------------------------------------------
 * CLI Command
 * --------------------------------------------------------------------------- */

class WeeklyReviewCommand extends BaseCommand {
  readonly name = 'weekly-review';
  readonly description =
    'Run full vault health review sequence (lint → orphans → relations → ontology → vocab → topk → unresolved)';
  readonly usage = 'nerv weekly-review [--vault <name>] <project_slug> [--json]';
  readonly minPositional = 1;

  protected async execute(ctx: CommandContext): Promise<void> {
    const slug = ctx.positional[0];

    if (!Slug.PATTERN.test(slug)) {
      process.stderr.write(
        `ERROR: weekly-review: project slug must be lowercase alphanumeric with hyphens (got: ${slug})\n`
      );
      process.exit(1);
    }

    const { result, failedCmd } = await runWeeklyReview(ctx.vault, slug, ctx.jsonOutput, REAL_DEPS);

    if (ctx.jsonOutput) {
      process.stdout.write(JSON.stringify(result) + '\n');
    }

    if (failedCmd) {
      process.stderr.write(`ERROR: weekly-review: sub-command failed: ${failedCmd}\n`);
      process.exit(1);
    }
  }
}

export default new WeeklyReviewCommand();
