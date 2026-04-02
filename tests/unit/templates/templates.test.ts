import { describe, expect, test } from 'bun:test';
import { renderBase } from '../../../src/templates/base';
import { renderBranch } from '../../../src/templates/branch';
import { renderDaily } from '../../../src/templates/daily';
import { renderInbox } from '../../../src/templates/inbox';
import { renderLeaf } from '../../../src/templates/leaf';
import { renderOntology, renderVaultOntology } from '../../../src/templates/ontology';
import { renderRoot } from '../../../src/templates/root';
import { renderTopk, renderVaultTopk } from '../../../src/templates/topk';
import { renderVaultVocab, renderVocab } from '../../../src/templates/vocab';

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

// ---------------------------------------------------------------------------
// renderInbox
// ---------------------------------------------------------------------------
describe('renderInbox', () => {
  const params = { title: 'My Capture', captured: '2026-03-27' };

  test('contains YAML frontmatter with title, captured, status', () => {
    const out = renderInbox(params);
    expect(out).toContain('title: "My Capture"');
    expect(out).toContain('captured: 2026-03-27');
    expect(out).toContain('status: inbox');
    expect(out).toContain('source: ""');
    expect(out).toContain('target: ""');
  });

  test('contains triage checklist', () => {
    const out = renderInbox(params);
    expect(out).toContain('> [!todo] Triage');
    expect(out).toContain('Identify note type');
    expect(out).toContain('Determine parent');
  });

  test('contains Raw and Placement Notes sections', () => {
    const out = renderInbox(params);
    expect(out).toContain('## Raw');
    expect(out).toContain('## Placement Notes');
  });

  test('contains no undefined or null values', () => {
    const out = renderInbox(params);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('works with Obsidian template variables', () => {
    const out = renderInbox({ title: '{{title}}', captured: '{{date}}' });
    expect(out).toContain('title: "{{title}}"');
    expect(out).toContain('captured: {{date}}');
  });

  test('snapshot matches expected output', () => {
    expect(renderInbox(params)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderDaily
// ---------------------------------------------------------------------------
describe('renderDaily', () => {
  const params = { date: '2026-03-27' };

  test('contains YAML frontmatter with title, type, date, tags', () => {
    const out = renderDaily(params);
    expect(out).toContain('title: "2026-03-27"');
    expect(out).toContain('type: daily-note');
    expect(out).toContain('date: 2026-03-27');
    expect(out).toContain('tags: [journal/daily]');
  });

  test('contains all work log subsections', () => {
    const out = renderDaily(params);
    expect(out).toContain('### Entities Created');
    expect(out).toContain('### Schema Changes');
    expect(out).toContain('### Decisions');
    expect(out).toContain('### Open Questions');
  });

  test('contains triage query block', () => {
    const out = renderDaily(params);
    expect(out).toContain('```query');
    expect(out).toContain('path:_inbox');
  });

  test('contains Tasks and Notes sections', () => {
    const out = renderDaily(params);
    expect(out).toContain('## Tasks');
    expect(out).toContain('## Notes');
  });

  test('contains no undefined or null values', () => {
    const out = renderDaily(params);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
  });

  test('works with Obsidian template variables', () => {
    const out = renderDaily({ date: '{{date}}' });
    expect(out).toContain('title: "{{date}}"');
    expect(out).toContain('date: {{date}}');
  });

  test('snapshot matches expected output', () => {
    expect(renderDaily(params)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderVaultOntology
// ---------------------------------------------------------------------------
describe('renderVaultOntology', () => {
  const params = { title: 'My Domain', created: '2026-03-27', modified: '2026-03-27' };

  test('contains full vault template frontmatter', () => {
    const out = renderVaultOntology(params);
    expect(out).toContain('title: "My Domain Ontology"');
    expect(out).toContain('type: ONTOLOGY');
    expect(out).toContain('spine: ""');
    expect(out).toContain('status: active');
    expect(out).toContain('created: 2026-03-27');
    expect(out).toContain('modified: 2026-03-27');
  });

  test('contains exactly 10 relationship rows with Direction column', () => {
    const out = renderVaultOntology(params);
    // Match data rows (not header rows starting with `| \`type\``)
    const rows = out.split('\n').filter(l => l.startsWith('| `') && !l.startsWith('| `type`'));
    expect(rows).toHaveLength(10);
    expect(out).toContain('Direction');
    expect(out).toContain('A → B');
  });

  test('contains Custom Types section', () => {
    const out = renderVaultOntology(params);
    expect(out).toContain('## Custom Types');
  });

  test('works with Obsidian template variables', () => {
    const out = renderVaultOntology({
      title: '{{title}}',
      created: '{{date}}',
      modified: '{{date}}',
    });
    expect(out).toContain('title: "{{title}} Ontology"');
  });

  test('snapshot matches expected output', () => {
    expect(renderVaultOntology(params)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderVaultVocab
// ---------------------------------------------------------------------------
describe('renderVaultVocab', () => {
  const params = { title: 'My Domain', created: '2026-03-27', modified: '2026-03-27' };

  test('contains full vault template frontmatter', () => {
    const out = renderVaultVocab(params);
    expect(out).toContain('title: "My Domain Vocabulary"');
    expect(out).toContain('type: VOCAB');
    expect(out).toContain('spine: ""');
    expect(out).toContain('status: active');
    expect(out).toContain('created: 2026-03-27');
  });

  test('contains all vocabulary level sections', () => {
    const out = renderVaultVocab(params);
    expect(out).toContain('## L0 — Core Terms');
    expect(out).toContain('## L1 — Primary Terms');
    expect(out).toContain('## L2 — Secondary Terms');
    expect(out).toContain('## L3 — Peripheral Terms');
    expect(out).toContain('## Shared Terms');
    expect(out).toContain('## Orphan Terms');
  });

  test('contains HTML comment guides', () => {
    const out = renderVaultVocab(params);
    expect(out).toContain('<!-- Foundational terms');
    expect(out).toContain('<!-- Terms not yet categorized');
  });

  test('snapshot matches expected output', () => {
    expect(renderVaultVocab(params)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// renderVaultTopk
// ---------------------------------------------------------------------------
describe('renderVaultTopk', () => {
  const params = { title: 'My Domain', created: '2026-03-27', modified: '2026-03-27' };

  test('contains full vault template frontmatter', () => {
    const out = renderVaultTopk(params);
    expect(out).toContain('title: "My Domain Top-K"');
    expect(out).toContain('type: TOPK');
    expect(out).toContain('spine: ""');
    expect(out).toContain('status: active');
    expect(out).toContain('created: 2026-03-27');
  });

  test('contains limits table with 5 category rows', () => {
    const out = renderVaultTopk(params);
    expect(out).toContain('| Root notes');
    expect(out).toContain('| Branch notes per root');
    expect(out).toContain('| Leaf notes per branch');
    expect(out).toContain('| Relationship types');
    expect(out).toContain('| Vocab terms (total)');
  });

  test('contains Overflow Log and Split History sections', () => {
    const out = renderVaultTopk(params);
    expect(out).toContain('## Overflow Log');
    expect(out).toContain('## Split History');
  });

  test('snapshot matches expected output', () => {
    expect(renderVaultTopk(params)).toMatchSnapshot();
  });
});
