---
title: 'Implement get-tree.sh sensory skill'
team: 'Obsidian Nervous System'
priority: 'High'
storyPoints: 3
epic: 'EPIC-005 — Sensory Skills: Knowledge Retrieval'
planKey: 'STORY-018'
phase: 4
sequence: 3
parallelTrack: B
size: 'M — ~0.5 day'
dependsOn:
  - STORY-003
  - STORY-006
blocks: []
decisionGate: ~
validationBasis: 'Verified by PLAN.md §Story 018 acceptance criteria'
---

## Goal

Author `get-tree.sh` in `~/.ontology-cli/core/` to return the complete hierarchical note tree for a project as nested JSON. This skill gives the agent the full shape of a project's knowledge graph in a single call.

## Acceptance Criteria

- [ ] `get-tree.sh study aws` returns: `{"folder":"projects/aws","nodeCount":N,"tree":[{"path":"...","title":"...","type":"ROOT","subtree":[{"type":"BRANCH","subtree":[{"type":"LEAF"}]}]}]}`
- [ ] Missing children (wikilink in parent's `children:` resolves to no file) are represented as `{"missing":"<n>"}` nodes in the subtree
- [ ] Cycle detection is implemented — a child pointing back to an ancestor is flagged as `{"cycle":"<path>"}` rather than causing infinite recursion
- [ ] Accepts `vault=` parameter
- [ ] `tests/test-get-tree.sh` passes in the test harness

## Additional Information

Builds the nested structure recursively starting from ROOT nodes; tracks visited paths in a `Set` to detect cycles. The tree structure gives the agent a complete picture of project depth and coverage at a glance.

> [!important]
> The tree traversal must be implemented in JavaScript inside a single `obsidian eval` call — not via recursive shell script invocations. Recursive shell calls would require one `eval` per node and would be unacceptably slow for deep trees.

## System Design

- [PLAN.md — Story 018](../PLAN.md)
- [obsidian_docs.md — v11 §9 Hierarchy, ROOT/BRANCH/LEAF structure](../obsidian_docs.md)

## Resources

- [JavaScript recursive tree building with `Set` for cycle detection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set): `const visited = new Set(); function buildTree(path) { if (visited.has(path)) return {"cycle": path}; visited.add(path); ... }` — clean recursive pattern
- [Obsidian `app.metadataCache.getFileCache(file)?.frontmatter?.children`](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache): `children` is a YAML array of wikilink strings; resolve each to a `TFile` with `getFirstLinkpathDest` before recursing
- [JSON `nodeCount` from recursive traversal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify): count nodes by incrementing a counter in the `buildTree` function; return the count at the top level alongside the tree array

## Recommendations

- Find ROOT nodes by filtering all project files for `frontmatter.type === 'ROOT'` rather than assuming there is exactly one ROOT per project — multi-root projects are possible
- Include `status` and `kind` in each tree node to allow the agent to quickly identify draft subtrees or specific knowledge domains without a follow-up `get-entity.sh` call
- Add a `--depth N` flag to limit tree depth for large projects — the full tree of a 200-note project can be large enough to stress the agent context window

---
