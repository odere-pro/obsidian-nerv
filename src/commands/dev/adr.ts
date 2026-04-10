/**
 * adr — Dev skill: create an Architecture Decision Record as a LEAF note.
 *
 * Creates a LEAF note with kind: decision, decision-date: YYYY-MM-DD,
 * decision-status: proposed; body contains ### Context, ### Decision, ### Consequences.
 * Delegates entity creation to createEntity().
 */

import { BaseCommand, type CommandContext } from '../base-command';
import type { CommandResult } from '../../types/result';
import { Slug } from '../../types/slug';
import { createEntity } from '../create-entity';
import { getVaultOps } from '../../ports/provider';

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

export function patchAdrContent(content: string): string {
  const contextHint = '*What problem or force is driving this decision?*';
  const decisionHint = '*What was decided? State it as a full sentence.*';
  const consequencesHint = '*What are the resulting trade-offs, risks, and obligations?*';

  const marker = '## Content';
  const idx = content.indexOf(marker);
  if (idx === -1) return content;

  const after = content.substring(idx + marker.length);
  if (after.indexOf('### Context') !== -1) return content;

  const nextSection = after.match(/\n## /);
  const insertAt = nextSection ? idx + marker.length + (nextSection.index ?? 0) : content.length;

  const subsections =
    '\n\n### Context\n\n' +
    contextHint +
    '\n\n### Decision\n\n' +
    decisionHint +
    '\n\n### Consequences\n\n' +
    consequencesHint +
    '\n';

  return content.substring(0, idx + marker.length) + subsections + content.substring(insertAt);
}

export async function createAdr(params: AdrParams): Promise<CommandResult<AdrData>> {
  const { vault, project, title, parentSlug = 'ROOT' } = params;

  const slug = generateAdrSlug(title);
  const today = new Date().toISOString().slice(0, 10);

  if (!Slug.PATTERN.test(slug)) {
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
      error: entityResult.error ?? 'unknown error',
    };
  }

  const notePath = entityResult.data.path;
  const ops = getVaultOps();

  /* Patch frontmatter: add decision-date and decision-status */
  try {
    await ops.updateFrontmatter(vault, notePath, {
      'decision-date': today,
      'decision-status': 'proposed',
    });
  } catch {
    return {
      ok: false,
      data: { path: notePath, slug, decisionDate: today, decisionStatus: 'proposed' },
      error: `adr: could not patch frontmatter for ${notePath}`,
    };
  }

  /* Patch ## Content with ADR subsections */
  try {
    const file = await ops.readFile(vault, notePath);
    const patched = patchAdrContent(file.content);
    if (patched !== file.content) {
      await ops.replaceFileContent(vault, notePath, patched);
    }
  } catch {
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

class AdrCommand extends BaseCommand {
  readonly name = 'dev/adr';
  readonly description = 'Create an Architecture Decision Record as a LEAF note';
  readonly usage = 'nerv dev/adr [--vault <name>] <project_slug> "<title>" [<parent_slug>]';
  readonly minPositional = 2;

  protected async execute(ctx: CommandContext): Promise<void> {
    const project = ctx.positional[0];
    const title = ctx.positional[1];
    const parentSlug = ctx.positional[2];

    const result = await createAdr({ vault: ctx.vault, project, title, parentSlug });

    if (!result.ok) {
      ctx.out.error(result.error);
    }

    process.stdout.write(`ADR created: ${result.data.path}\n`);
    process.stdout.write(`  decision-date:   ${result.data.decisionDate}\n`);
    process.stdout.write(`  decision-status: ${result.data.decisionStatus}\n`);
  }
}

export default new AdrCommand();
