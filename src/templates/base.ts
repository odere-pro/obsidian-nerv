// STORY-032 — Note template extraction: base template (Obsidian Bases YAML)

export interface BaseParams {
  slug: string;
}

export function renderBase(params: BaseParams): string {
  return `filters:
  - file.inFolder("projects/${params.slug}")
formulas:
  status_icon: 'if(status == "published", "✅", if(status == "review", "🔍", if(status == "draft", "📝", "⬜")))'
  last_updated: 'modified'
  link_count: 'file.outlinks.length'
views:
  - type: table
    name: All Notes
    order:
      - file.name
      - formula.status_icon
      - type
      - kind
      - spine
      - created
      - formula.last_updated
  - type: table
    name: Drafts
    filters:
      and:
        - 'status == "draft"'
    order:
      - file.name
      - type
      - kind
      - created
  - type: table
    name: Browse
    order:
      - file.name
      - type
      - kind
      - formula.link_count
      - formula.last_updated
`;
}
