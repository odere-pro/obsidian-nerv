import type { EntityStatus } from '../types/entity';
import { renderEntityBody, renderEntityFrontmatter } from './frontmatter';

export interface RootParams {
  title: string;
  kind: string;
  spine: string;
  status: EntityStatus;
  /** YYYY-MM-DD */
  created: string;
  /** YYYY-MM-DD */
  modified: string;
}

export function renderRoot(params: RootParams): string {
  const fm = renderEntityFrontmatter({
    title: params.title,
    type: 'ROOT',
    kind: params.kind,
    spine: params.spine,
    status: params.status,
    parent: '',
    created: params.created,
    modified: params.modified,
  });
  return `${fm}\n\n${renderEntityBody('ROOT')}\n`;
}
