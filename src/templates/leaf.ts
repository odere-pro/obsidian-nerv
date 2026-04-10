import type { EntityStatus } from '../types/entity';
import { renderEntityBody, renderEntityFrontmatter } from './frontmatter';

export interface BaseEntityParams {
  title: string;
  slug: string;
  project: string;
  kind: string;
  spine: string;
  status: EntityStatus;
  /** YYYY-MM-DD */
  created: string;
  /** YYYY-MM-DD */
  modified: string;
}

export interface LeafParams extends BaseEntityParams {
  /** Wiki link, e.g. `[[PROJ.ROOT - Title]]` */
  parent: string;
}

export function renderLeaf(params: LeafParams): string {
  const fm = renderEntityFrontmatter({
    title: params.title,
    type: 'LEAF',
    kind: params.kind,
    spine: params.spine,
    status: params.status,
    parent: params.parent,
    created: params.created,
    modified: params.modified,
  });
  return `${fm}\n\n${renderEntityBody('LEAF')}\n`;
}
