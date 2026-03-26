import { describe, expect, test } from 'bun:test';
import { renderLeaf } from '../leaf.ts';
import { renderBranch } from '../branch.ts';
import { renderRoot } from '../root.ts';
import { renderOntology } from '../ontology.ts';
import { renderVocab } from '../vocab.ts';
import { renderTopk } from '../topk.ts';
import { renderBase } from '../base.ts';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const TODAY = '2026-03-26';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const leafParams = {
  title: 'Test Leaf',
  slug: 'test-leaf',
  project: 'myproj',
  kind: 'concept',
  spine: 'myproj',
  status: 'draft' as const,
  parent: '[[MYPROJ.ROOT - My Project]]',
  created: TODAY,
  modified: TODAY,
};

const branchParams = {
  title: 'Test Branch',
  slug: 'test-branch',
  project: 'myproj',
  kind: 'concept',
  spine: 'myproj',
  status: 'draft' as const,
  parent: '[[MYPROJ.ROOT - My Project]]',
  created: TODAY,
  modified: TODAY,
};

const rootParams = {
  title: 'My Project',
  kind: 'concept',
  spine: 'myproj',
  status: 'draft' as const,
  created: TODAY,
  modified: TODAY,
};

const ontologyParams = { project: 'myproj', updated: TODAY };
const vocabParams = { project: 'myproj', updated: TODAY };
const topkParams = { project: 'myproj', updated: TODAY };
const baseParams = { slug: 'myproj' };

// ---------------------------------------------------------------------------
// renderLeaf
// ---------------------------------------------------------------------------
describe('renderLeaf', () => {
  test('contains all required YAML frontmatter keys', () => {
    const out = renderLeaf(leafParams);
    expect(out).toContain('title: "Test Leaf"');
    expect(out).toContain('type: LEAF');
    expect(out).toContain('kind: concept');
    expect(out).toContain('spine: myproj');
    expect(out).toContain('status: draft');
    expect(out).toContain('parent: "[[MYPROJ.ROOT - My Project]]"');
    expect(out).toContain('children: []');
    expect(out).toContain('aliases: []');
    expect(out).toContain('attachments: []');
    expect(out).toContain(`created: ${TODAY}`);
    expect(out).toContain(`modified: ${TODAY}`);
    expect(out).toContain('tags: []');
  });

  test('contains no undefined or null values', () => {
    const out = renderLeaf(leafParams);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('created and modified use YYYY-MM-DD format', () => {
    const out = renderLeaf(leafParams);
    const createdMatch = out.match(/created: (\S+)/);
    const modifiedMatch = out.match(/modified: (\S+)/);
    expect(createdMatch?.[1]).toMatch(DATE_RE);
    expect(modifiedMatch?.[1]).toMatch(DATE_RE);
  });

  test('body contains required sections', () => {
    const out = renderLeaf(leafParams);
    expect(out).toContain('## Breadcrumb');
    expect(out).toContain('## Summary');
    expect(out).toContain('## Content');
    expect(out).toContain('## Connections');
    expect(out).toContain('## Flags');
  });

  test('snapshot matches expected output', () => {
    expect(renderLeaf(leafParams)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderBranch
// ---------------------------------------------------------------------------
describe('renderBranch', () => {
  test('contains all required YAML frontmatter keys', () => {
    const out = renderBranch(branchParams);
    expect(out).toContain('title: "Test Branch"');
    expect(out).toContain('type: BRANCH');
    expect(out).toContain('kind: concept');
    expect(out).toContain('spine: myproj');
    expect(out).toContain('status: draft');
    expect(out).toContain('parent: "[[MYPROJ.ROOT - My Project]]"');
    expect(out).toContain('children: []');
    expect(out).toContain('aliases: []');
    expect(out).toContain('attachments: []');
    expect(out).toContain(`created: ${TODAY}`);
    expect(out).toContain(`modified: ${TODAY}`);
    expect(out).toContain('tags: []');
  });

  test('contains no undefined or null values', () => {
    const out = renderBranch(branchParams);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('body contains required sections', () => {
    const out = renderBranch(branchParams);
    expect(out).toContain('## Breadcrumb');
    expect(out).toContain('## Summary');
    expect(out).toContain('## Content');
    expect(out).toContain('## Connections');
    expect(out).toContain('## Flags');
  });

  test('snapshot matches expected output', () => {
    expect(renderBranch(branchParams)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderRoot
// ---------------------------------------------------------------------------
describe('renderRoot', () => {
  test('contains all required YAML frontmatter keys', () => {
    const out = renderRoot(rootParams);
    expect(out).toContain('title: "My Project"');
    expect(out).toContain('type: ROOT');
    expect(out).toContain('kind: concept');
    expect(out).toContain('spine: myproj');
    expect(out).toContain('status: draft');
    expect(out).toContain('parent: ""');
    expect(out).toContain('children: []');
    expect(out).toContain('aliases: []');
    expect(out).toContain('attachments: []');
    expect(out).toContain(`created: ${TODAY}`);
    expect(out).toContain(`modified: ${TODAY}`);
  });

  test('contains no undefined or null values', () => {
    const out = renderRoot(rootParams);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('parent is always empty string', () => {
    const out = renderRoot(rootParams);
    expect(out).toContain('parent: ""');
  });

  test('body contains required sections', () => {
    const out = renderRoot(rootParams);
    expect(out).toContain('## Summary');
    expect(out).toContain('## Map');
    expect(out).toContain('## Connections');
    expect(out).toContain('## Flags');
  });

  test('snapshot matches expected output', () => {
    expect(renderRoot(rootParams)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderOntology
// ---------------------------------------------------------------------------
describe('renderOntology', () => {
  test('contains YAML frontmatter with type, project, updated', () => {
    const out = renderOntology(ontologyParams);
    expect(out).toContain('type: ONTOLOGY');
    expect(out).toContain('project: myproj');
    expect(out).toContain(`updated: ${TODAY}`);
  });

  test('contains no undefined or null values', () => {
    const out = renderOntology(ontologyParams);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('contains exactly 10 relationship rows', () => {
    const out = renderOntology(ontologyParams);
    // Count pipe-separated data rows (not the header or separator row)
    const rows = out.split('\n').filter(l => l.startsWith('| `'));
    expect(rows).toHaveLength(10);
  });

  test('snapshot matches expected output', () => {
    expect(renderOntology(ontologyParams)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderVocab
// ---------------------------------------------------------------------------
describe('renderVocab', () => {
  test('contains YAML frontmatter with type, project, updated', () => {
    const out = renderVocab(vocabParams);
    expect(out).toContain('type: VOCAB');
    expect(out).toContain('project: myproj');
    expect(out).toContain(`updated: ${TODAY}`);
  });

  test('contains no undefined or null values', () => {
    const out = renderVocab(vocabParams);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('snapshot matches expected output', () => {
    expect(renderVocab(vocabParams)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderTopk
// ---------------------------------------------------------------------------
describe('renderTopk', () => {
  test('contains YAML frontmatter with type, project, updated', () => {
    const out = renderTopk(topkParams);
    expect(out).toContain('type: TOPK');
    expect(out).toContain('project: myproj');
    expect(out).toContain(`updated: ${TODAY}`);
  });

  test('contains no undefined or null values', () => {
    const out = renderTopk(topkParams);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('contains Limits and Overflow Log sections', () => {
    const out = renderTopk(topkParams);
    expect(out).toContain('## Limits');
    expect(out).toContain('## Overflow Log');
    expect(out).toContain('## Split History');
  });

  test('snapshot matches expected output', () => {
    expect(renderTopk(topkParams)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderBase
// ---------------------------------------------------------------------------
describe('renderBase', () => {
  test('contains inFolder filter with correct slug', () => {
    const out = renderBase(baseParams);
    expect(out).toContain('file.inFolder("projects/myproj")');
  });

  test('contains no undefined or null values', () => {
    const out = renderBase(baseParams);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('contains default views: All Notes, Drafts, Browse', () => {
    const out = renderBase(baseParams);
    expect(out).toContain('name: All Notes');
    expect(out).toContain('name: Drafts');
    expect(out).toContain('name: Browse');
  });

  test('snapshot matches expected output', () => {
    expect(renderBase(baseParams)).toMatchSnapshot();
  });
});
