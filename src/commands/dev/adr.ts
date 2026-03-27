// adr — Dev skill: create an Architecture Decision Record as a LEAF note.
//
// Creates a LEAF note with kind: decision, decision-date: YYYY-MM-DD,
// decision-status: proposed; body contains ### Context, ### Decision, ### Consequences.
// Delegates entity creation to createEntity().

import type { Command } from '../../cli';
import { encodeForJs } from '../../lib/json';
import { obEval, resolveVault } from '../../lib/obsidian';
import type { CommandResult } from '../../types/result';
import { createEntity } from '../create-entity';
import { extractVaultFlag } from '../../lib/vault-registry';

const ADR_SLUG_RE = /^[a-z0-9-]+$/;

export function generateAdrSlug(title: string): string {
  const dateCompact = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slugBody = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `adr-${dateCompact}-${slugBody}`;
}

export interface AdrParams {
  vault: string;
  project: string;
  title: string;
  parentSlug?: string;
}

export interface AdrData {
  path: string;
  slug: string;
  decisionDate: string;
  decisionStatus: string;
}

export async function createAdr(params: AdrParams): Promise<CommandResult<AdrData>> {
  const { vault, project, title, parentSlug = 'ROOT' } = params;

  const slug = generateAdrSlug(title);
  const today = new Date().toISOString().slice(0, 10);

  if (!ADR_SLUG_RE.test(slug)) {
    return {
      ok: false,
      data: { path: '', slug, decisionDate: today, decisionStatus: 'proposed' },
      error: `adr: generated slug is invalid (got: ${slug}) — check title for special characters`,
    };
  }

  const entityResult = await createEntity({
    vault,
    project,
    type: 'LEAF',
    slug,
    title,
    parentSlug,
    kind: 'decision',
  });

  if (!entityResult.ok) {
    return {
      ok: false,
      data: { path: '', slug, decisionDate: today, decisionStatus: 'proposed' },
      error: entityResult.error,
    };
  }

  const notePath = entityResult.data.path;
  const jsPath = encodeForJs(notePath);
  const jsDate = encodeForJs(today);

  // Patch frontmatter: add decision-date and decision-status
  const patchFmResult = await obEval(
    vault,
    `(async () => {
  var f = app.vault.getAbstractFileByPath(${jsPath});
  if (!f) return 'not-found';
  await app.fileManager.processFrontMatter(f, function(fm) {
    fm['decision-date']   = ${jsDate};
    fm['decision-status'] = 'proposed';
  });
  return 'ok';
})()`
  ).catch(() => '');

  if (!patchFmResult || patchFmResult === 'not-found') {
    return {
      ok: false,
      data: { path: notePath, slug, decisionDate: today, decisionStatus: 'proposed' },
      error: `adr: could not patch frontmatter for ${notePath}`,
    };
  }

  // Patch ## Content with ADR subsections
  const jsContextHint = encodeForJs('*What problem or force is driving this decision?*');
  const jsDecisionHint = encodeForJs('*What was decided? State it as a full sentence.*');
  const jsConsequencesHint = encodeForJs(
    '*What are the resulting trade-offs, risks, and obligations?*'
  );

  const patchContentResult = await obEval(
    vault,
    `(async () => {
  var f = app.vault.getAbstractFileByPath(${jsPath});
  if (!f) return 'not-found';
  await app.vault.process(f, function(content) {
    var marker = '## Content';
    var idx = content.indexOf(marker);
    if (idx === -1) return content;
    var after = content.substring(idx + marker.length);
    if (after.indexOf('### Context') !== -1) return content;
    var nextSection = after.match(/\n## /);
    var insertAt = nextSection
      ? idx + marker.length + nextSection.index
      : content.length;
    var subsections = '\n\n### Context\n\n' + ${jsContextHint} +
      '\n\n### Decision\n\n' + ${jsDecisionHint} +
      '\n\n### Consequences\n\n' + ${jsConsequencesHint} + '\n';
    return content.substring(0, idx + marker.length) +
           subsections +
           content.substring(insertAt);
  });
  return 'ok';
})()`
  ).catch(() => '');

  if (!patchContentResult || patchContentResult === 'not-found') {
    return {
      ok: false,
      data: { path: notePath, slug, decisionDate: today, decisionStatus: 'proposed' },
      error: `adr: could not patch Content sections for ${notePath}`,
    };
  }

  return {
    ok: true,
    data: { path: notePath, slug, decisionDate: today, decisionStatus: 'proposed' },
  };
}

const command: Command = {
  name: 'dev/adr',
  description: 'Create an Architecture Decision Record as a LEAF note',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 2) {
      process.stderr.write(
        'Usage: nerv dev/adr [--vault <name>] <project_slug> "<title>" [<parent_slug>]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const project = rest[0];
    const title = rest[1];
    const parentSlug = rest[2];

    const result = await createAdr({ vault, project, title, parentSlug });

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    process.stdout.write(`ADR created: ${result.data.path}\n`);
    process.stdout.write(`  decision-date:   ${result.data.decisionDate}\n`);
    process.stdout.write(`  decision-status: ${result.data.decisionStatus}\n`);
  },
};

export default command;
