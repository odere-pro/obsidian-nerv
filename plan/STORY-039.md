---
title: 'Migrate canvas generation to TypeScript with JSON Canvas skill support'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 5
epic: 'EPIC-010 — Production Grade: Bun Migration'
planKey: 'STORY-039'
phase: 7
sequence: 7
parallelTrack: C
size: 'M — ~0.5 day'
dependsOn:
  - STORY-032
blocks: []
decisionGate: ~
validationBasis: 'bun test src/commands/__tests__/canvas.test.ts passes all node/edge generation assertions; canvas files conform to JSON Canvas 1.0 spec; bun test tests/integration/canvas/ passes with OBSIDIAN_RUNNING=1'
---

## Goal

Create TypeScript command modules for generating JSON Canvas files — visual mind maps, dependency flowcharts, and project hierarchies.
Implement canvas generation as a new command family (`canvas:tree`, `canvas:relations`, `canvas:dependencies`) that leverage the `json-canvas` skill to produce spec-compliant `.canvas` files.
Enable AI agents to create rich visual representations of vault structure without manual diagramming.

## Acceptance criteria

### canvas:tree

- [ ] `src/commands/canvas/tree.ts` exports `Command` and `generateTreeCanvas(vault: string, project: string): Promise<CanvasResult>` (programmatic API)
- [ ] Reads project hierarchy from parent/children frontmatter relationships
- [ ] Generates canvas with one `type: text` node per note; nested children positioned hierarchically (x-offset per depth level, y-offset per sibling index)
- [ ] Node sizing: 400×200px for all nodes (standard medium size from json-canvas skill)
- [ ] Node coloring: ROOT notes `"1"` (Red), BRANCH notes `"2"` (Orange), LEAF notes `"3"` (Yellow)
- [ ] Edges drawn from parent to each child with `toEnd: "arrow"`; edge labels show relationship type if available
- [ ] File output: `projects/<slug>/<slug>.tree.canvas`
- [ ] JSON structure conforms to [JSON Canvas 1.0 spec](https://jsoncanvas.org/spec/1.0/): `{ "nodes": [], "edges": [] }`
- [ ] Every node ID is a unique 16-character lowercase hexadecimal string (e.g., `"6f0ad84f44ce9c17"`)
- [ ] Canvas opens in Obsidian without errors; tree layout is human-readable (not overlapping nodes)

### canvas:relations

- [ ] `src/commands/canvas/relations.ts` exports `Command` and `generateRelationsCanvas(vault: string, project: string): Promise<CanvasResult>`
- [ ] Reads `## Connections` sections and relationship types from `_ontology.<slug>.md`
- [ ] Generates nodes for each note in the project; large connecting relationship network
- [ ] Node coloring by relationship type: `parent-of` edges in blue, `depends-on` in purple, `related-to` in gray, `triggers` in green, `implements` in orange
- [ ] Edges labeled with relationship type (e.g., `"depends-on"`)
- [ ] Layout uses force-directed simulation (or grid-based fallback) to minimize crossing edges and overlaps
- [ ] File output: `projects/<slug>/<slug>.relations.canvas`
- [ ] Conforms to JSON Canvas 1.0 spec

### canvas:dependencies

- [ ] `src/commands/canvas/dependencies.ts` exports `Command` and `generateDependenciesCanvas(vault: string, project: string): Promise<CanvasResult>`
- [ ] Filters to `depends-on` edges only (excludes related-to, triggers, implements, etc.)
- [ ] Generates a directed acyclic graph (DAG) showing project dependencies
- [ ] Lays out nodes to minimize backlinks: sources on left, sinks on right (topological ordering when possible)
- [ ] Node coloring: no dependencies `"3"` (Yellow), has dependencies `"2"` (Orange), is depended-on `"1"` (Red)
- [ ] File output: `projects/<slug>/<slug>.dependencies.canvas`
- [ ] Conforms to JSON Canvas 1.0 spec

### Tests

- [ ] `src/commands/__tests__/canvas/tree.test.ts`: tests hierarchy layout with mock vault structure (3-level tree); verifies node IDs are unique hex strings, node positions increase with depth, edges point downward (parent → child); at least 4 assertions
- [ ] `src/commands/__tests__/canvas/relations.test.ts`: tests relationship edge coloring and labeling; verifies all connection types are represented; at least 3 assertions
- [ ] `src/commands/__tests__/canvas/dependencies.test.ts`: tests topological ordering (no backward edges in DAG); verifies color mapping (sink/source/middle); at least 3 assertions
- [ ] `src/commands/__tests__/canvas/spec-compliance.test.ts`: validates JSON Canvas 1.0 spec compliance: all nodes have `id`, `type`, `x`, `y`, `width`, `height`; all edges have `fromNode`, `toNode`, `fromSide`, `toSide`, `toEnd`; all IDs are 16-char hex; at least 5 assertions
- [ ] `tests/integration/canvas/tree.integration.test.ts`: generates canvas against live test project; verifies file written to correct path; canvas opens in Obsidian without console errors; requires `OBSIDIAN_RUNNING=1`
- [ ] `bun test src/commands/__tests__/canvas/` exits 0 without Obsidian

## Additional information

The `json-canvas` skill enables visual representation via the JSON Canvas open standard.
Canvas generation is a read-only operation — it does not modify vault notes, only creates `.canvas` visualization files.
These commands integrate well with the `explain-topic` (STORY-035) and `dependency-map` (STORY-037) commands: canvas files can visualize the same graph structures those commands produce as JSON.

> [!important]
> Canvas file names must use the pattern `<slug>.<type>.canvas` (e.g., `aws.tree.canvas`, `aws.relations.canvas`).
> Obsidian requires unique file names within a project folder — the `.<type>` infix prevents collisions when generating multiple canvas types for the same project.
> Every node ID must be unique across the canvas file — use a deterministic hash of the note path + type to ensure consistency across re-runs:
> `nodeId = md5(path + type).substring(0, 16)` (deterministic, not random).

## System design

- [PLAN.md — Story 039](../PLAN.md)
- [obsidian-skill-documentation.md — json-canvas skill reference](../obsidian-skill-documentation.md#json-canvas-skill)
- [JSON Canvas 1.0 Specification](https://jsoncanvas.org/spec/1.0/)
- [STORY-035 — explain-topic produces similar graph data](STORY-035.md)
- [STORY-037 — dependency-map produces depends-on edges](STORY-037.md)

## Resources

- [JSON Canvas 1.0 Spec — node and edge structure](https://jsoncanvas.org/spec/1.0/): complete reference for `type`, `fromSide`/`toSide`, color codes (`"1"`–`"6"`), and ID format
- [Bun crypto for deterministic hashing](https://bun.sh/docs/api/crypto): `await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path))` or use the `md5` package for shorter hashes (16-char substring)
- [Graphviz DOT to canvas conversion pattern](https://graphviz.org/): if using a graph layout library like `dagre` or `cytoscape`, convert node positions to canvas coordinates (px units, origin at top-left)
- [Obsidian canvas API limitations](https://docs.obsidian.md/Plugins/Guides/Creating+canvas+files): canvas files are JSON-only — Obsidian does not provide a TypeScript API to create canvases programmatically

## Recommendations

- Use `src/lib/canvas.ts` as a shared utility module: `generateNodes(notes: NoteData[], colorFn)`, `generateEdges(connections, labelFn)`, `deterministic HexId(path, type)` — these are reusable across all three canvas commands
- For layout, start with a simple grid (depth × sibling index) — this is deterministic and fast. Upgrade to force-directed simulation (e.g., `d3-force`, `cytoscape`) only if visual quality suffers
- Add a `--format dot` flag to all three canvas commands (optional, FUTURE): output GraphViz DOT format in addition to default JSON for debugging and external tool compatibility
- Consider a `canvas:all` convenience command that generates all three types in one run — useful for daily reviews

## Security considerations

| Area               | Risk                                                        | Mitigation                                                                                                            |
| ------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Path injection     | Canvas file path derived from project slug                  | Validate slug against `/^[a-z0-9-]+$/` before constructing file path; assert path starts with `projects/<slug>/`      |
| Node ID collisions | Deterministic ID generation could collide for similar paths | Prepend slug or path prefix to hash input; verify uniqueness across all nodes in a canvas before writing              |
| Large graph layout | A project with 1000+ notes could produce very large canvas  | Implement pagination (multiple canvases per type) or filtering (e.g., `--max-nodes 100`); document performance limits |

---

> **Depends on**:
>
> - STORY-032 — template types and rendering functions available for reference
