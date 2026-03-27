// Ports assertions from cli/core/tests/test-cli-lint.sh.
// Requires: OBSIDIAN_RUNNING=1 environment variable.
//
// Creates deliberately malformed notes in the vault, runs lintProject(),
// verifies each of the 11 rules fires, then cleans up.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { lintProject } from '../../../src/commands/cli-lint';
import { encodeForJs } from '../../../src/lib/json';
import { obEval } from '../../../src/lib/obsidian';

const VAULT = process.env.TEST_VAULT ?? 'study';
const LINT_DIR = 'projects/_lint-test-ts';
const RUNNING = process.env.OBSIDIAN_RUNNING === '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createNote(path: string, content: string): Promise<void> {
  const jsPath = encodeForJs(path);
  const jsContent = encodeForJs(content);
  const jsDir = encodeForJs(LINT_DIR);
  await obEval(
    VAULT,
    `(async () => {
  const dir = ${jsDir};
  const folder = app.vault.getAbstractFileByPath(dir);
  if (!folder) await app.vault.createFolder(dir);
  const existing = app.vault.getAbstractFileByPath(${jsPath});
  if (!existing) await app.vault.create(${jsPath}, ${jsContent});
})()`
  );
}

async function cleanup(): Promise<void> {
  const jsDir = encodeForJs(LINT_DIR);
  await obEval(
    VAULT,
    `(async () => {
  const f = app.vault.getAbstractFileByPath(${jsDir});
  if (f) await app.vault.trash(f, false);
})()`
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!RUNNING) return;
  await cleanup();

  // 1. Missing required field (no 'kind')
  await createNote(
    `${LINT_DIR}/missing-field.md`,
    `---
title: Missing Field
aliases: []
type: LEAF
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
## Flags
`
  );

  // 2. ROOT with non-empty parent
  await createNote(
    `${LINT_DIR}/root-with-parent.md`,
    `---
title: Root With Parent
aliases: []
type: ROOT
kind: concept
spine: linttest
status: draft
parent: "[[some-parent]]"
children: []
attachments: []
created: 2025-01-01
---

## Summary
## Map
## Connections
## Flags
`
  );

  // 3. LEAF without parent
  await createNote(
    `${LINT_DIR}/leaf-no-parent.md`,
    `---
title: Leaf No Parent
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: ""
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
## Flags
`
  );

  // 4. BRANCH with empty children
  await createNote(
    `${LINT_DIR}/branch-empty-children.md`,
    `---
title: Branch Empty Children
aliases: []
type: BRANCH
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
## Flags
`
  );

  // 5. Spine tag in body
  await createNote(
    `${LINT_DIR}/spine-in-body.md`,
    `---
title: Spine In Body
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
Tagged with #linttest for testing.
## Content
## Connections
## Flags
`
  );

  // 6. Legacy #flag/ tag
  await createNote(
    `${LINT_DIR}/legacy-flag-tag.md`,
    `---
title: Legacy Flag Tag
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
See #flag/urgent for details.
## Content
## Connections
## Flags
`
  );

  // 7. Legacy #status/ tag
  await createNote(
    `${LINT_DIR}/legacy-status-tag.md`,
    `---
title: Legacy Status Tag
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
Marked as #status/review.
## Content
## Connections
## Flags
`
  );

  // 8. Untyped connection
  await createNote(
    `${LINT_DIR}/untyped-connection.md`,
    `---
title: Untyped Connection
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
- [[some-other-note]]
## Flags
`
  );

  // 9. Connection count > 7
  await createNote(
    `${LINT_DIR}/connection-limit.md`,
    `---
title: Connection Limit
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
- depends-on :: [[note-a]]
- depends-on :: [[note-b]]
- depends-on :: [[note-c]]
- depends-on :: [[note-d]]
- depends-on :: [[note-e]]
- depends-on :: [[note-f]]
- depends-on :: [[note-g]]
- depends-on :: [[note-h]]
## Flags
`
  );

  // 10. Missing ## Breadcrumb on LEAF
  await createNote(
    `${LINT_DIR}/no-breadcrumb.md`,
    `---
title: No Breadcrumb
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Summary
## Content
## Connections
## Flags
`
  );

  // 11. Callout flag count > 3
  await createNote(
    `${LINT_DIR}/flag-limit.md`,
    `---
title: Flag Limit
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb
## Summary
## Content
## Connections
## Flags
> [!flag] Flag one
> [!flag] Flag two
> [!flag] Flag three
> [!flag] Flag four
`
  );

  // 12. Clean note — should produce zero issues
  await createNote(
    `${LINT_DIR}/clean-note.md`,
    `---
title: Clean Note
aliases: []
type: LEAF
kind: concept
spine: linttest
status: draft
parent: "[[_LINT-TEST.root - Lint Root]]"
children: []
attachments: []
created: 2025-01-01
---

## Breadcrumb

## Summary

## Content

## Connections

## Flags
`
  );

  // Excluded files — should NOT appear in results
  await createNote(`${LINT_DIR}/tpl-test.md`, '---\ntitle: template\n---\n');
  await createNote(`${LINT_DIR}/_ontology.test.md`, '---\ntitle: onto\n---\n');
});

afterAll(async () => {
  if (!RUNNING) return;
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cli-lint integration', () => {
  test.skipIf(!RUNNING)('lintProject returns a valid LintResult structure', async () => {
    const result = await lintProject(VAULT, LINT_DIR);
    expect(result).toHaveProperty('vault');
    expect(result).toHaveProperty('folder');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('count');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.count).toBe(result.issues.length);
  });

  const expectedRules = [
    'missing-field',
    'root-has-parent',
    'missing-parent',
    'empty-children',
    'spine-in-body',
    'legacy-flag-tag',
    'legacy-status-tag',
    'untyped-connection',
    'connection-limit',
    'missing-breadcrumb',
    'flag-limit',
  ];

  for (const rule of expectedRules) {
    test.skipIf(!RUNNING)(`detects rule: ${rule}`, async () => {
      const result = await lintProject(VAULT, LINT_DIR);
      const found = result.issues.some(i => i.rule === rule);
      expect(found).toBe(true);
    });
  }

  test.skipIf(!RUNNING)('clean note produces zero issues', async () => {
    const result = await lintProject(VAULT, LINT_DIR);
    const cleanIssues = result.issues.filter(i => i.note.endsWith('clean-note.md'));
    expect(cleanIssues).toHaveLength(0);
  });

  test.skipIf(!RUNNING)('tpl-* files are excluded from lint', async () => {
    const result = await lintProject(VAULT, LINT_DIR);
    const tplIssues = result.issues.filter(i => i.note.includes('tpl-'));
    expect(tplIssues).toHaveLength(0);
  });

  test.skipIf(!RUNNING)('_ontology* files are excluded from lint', async () => {
    const result = await lintProject(VAULT, LINT_DIR);
    const ontoIssues = result.issues.filter(i => i.note.includes('_ontology'));
    expect(ontoIssues).toHaveLength(0);
  });

  test.skipIf(!RUNNING)('--json schema has vault, folder, issues, count keys', async () => {
    const result = await lintProject(VAULT, LINT_DIR);
    expect(typeof result.vault).toBe('string');
    expect(typeof result.folder).toBe('string');
    expect(typeof result.count).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    if (result.issues.length > 0) {
      const iss = result.issues[0];
      expect(typeof iss.note).toBe('string');
      expect(typeof iss.rule).toBe('string');
      expect(typeof iss.detail).toBe('string');
    }
  });
});
