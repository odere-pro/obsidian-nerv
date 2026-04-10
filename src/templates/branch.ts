import type { BaseEntityParams } from './leaf';
import { renderEntityBody, renderEntityFrontmatter } from './frontmatter';

export interface BranchParams extends BaseEntityParams {
  /** Wiki link, e.g. `[[PROJ.ROOT - Title]]` */
  parent: string;
}

export function renderBranch(params: BranchParams): string {
  const fm = renderEntityFrontmatter({
    title: params.title,
    type: 'BRANCH',
    kind: params.kind,
    spine: params.spine,
    status: params.status,
    parent: params.parent,
    created: params.created,
    modified: params.modified,
  });
  return `${fm}\n\n${renderEntityBody('BRANCH')}\n`;
}
