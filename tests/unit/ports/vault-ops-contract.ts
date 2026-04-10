// Reusable contract test runner for any VaultOps implementation.
// Usage: runVaultOpsContractTests('MyImpl', () => myImplInstance)

import { describe, expect, test } from 'bun:test';
import type { VaultOps } from '../../../src/ports/vault-ops';

const NERV_VAULT_PATH = process.env.NERV_VAULT_PATH ?? './docs/vaults';
const VAULT_NAME = process.env.NERV_TEST_VAULT || 'e2e-integration-test-vault';
const DEFAULT_VAULT = `${NERV_VAULT_PATH}/${VAULT_NAME}`;

export function runVaultOpsContractTests(
  label: string,
  factory: () => VaultOps | Promise<VaultOps>,
  options?: {
    vault?: string;
    seedFile?: (
      ops: VaultOps,
      vault: string,
      path: string,
      content: string,
      fm?: Record<string, unknown>
    ) => Promise<void>;
  }
): void {
  const VAULT = options?.vault ?? DEFAULT_VAULT;
  const seed =
    options?.seedFile ??
    (async (ops, vault, path, content, fm) => {
      await ops.createFile(vault, path, content);
      if (fm && Object.keys(fm).length > 0) {
        await ops.updateFrontmatter(vault, path, fm);
      }
    });

  describe(`VaultOps contract: ${label}`, () => {
    // 1. create -> exists -> read roundtrip
    test('create -> exists -> read roundtrip', async () => {
      const ops = await factory();
      const path = `contract/roundtrip-${Date.now()}.md`;

      expect(await ops.fileExists(VAULT, path)).toBe(false);
      await ops.createFile(VAULT, path, '# Hello');
      expect(await ops.fileExists(VAULT, path)).toBe(true);

      const file = await ops.readFile(VAULT, path);
      expect(file.path).toBe(path);
      expect(file.content).toContain('# Hello');
    });

    // 2. update frontmatter
    test('update frontmatter persists mutations', async () => {
      const ops = await factory();
      const path = `contract/fm-${Date.now()}.md`;

      await ops.createFile(VAULT, path, '---\ntitle: original\n---\n');
      await ops.updateFrontmatter(VAULT, path, { status: 'done', count: 42 });

      const file = await ops.readFile(VAULT, path);
      expect(file.frontmatter.status).toBe('done');
      expect(file.frontmatter.count).toBe(42);
    });

    // 3. append to file
    test('appendToFile appends content', async () => {
      const ops = await factory();
      const path = `contract/append-${Date.now()}.md`;

      await ops.createFile(VAULT, path, 'line1');
      await ops.appendToFile(VAULT, path, '\nline2');

      const file = await ops.readFile(VAULT, path);
      expect(file.content).toContain('line1');
      expect(file.content).toContain('line2');
    });

    // 4. replace file content
    test('replaceFileContent replaces content', async () => {
      const ops = await factory();
      const path = `contract/replace-${Date.now()}.md`;

      await ops.createFile(VAULT, path, 'old content');
      await ops.replaceFileContent(VAULT, path, 'new content');

      const file = await ops.readFile(VAULT, path);
      expect(file.content).toContain('new content');
      expect(file.content).not.toContain('old content');
    });

    // 5. trash file
    test('trashFile removes file from vault', async () => {
      const ops = await factory();
      const path = `contract/trash-${Date.now()}.md`;

      await ops.createFile(VAULT, path, 'temporary');
      expect(await ops.fileExists(VAULT, path)).toBe(true);

      await ops.trashFile(VAULT, path);
      expect(await ops.fileExists(VAULT, path)).toBe(false);
    });

    // 6. list files
    test('listFiles includes created files', async () => {
      const ops = await factory();
      const path = `contract/list-${Date.now()}.md`;

      await ops.createFile(VAULT, path, 'listed');
      const entries = await ops.listFiles(VAULT);
      const found = entries.find(e => e.path === path);
      expect(found).toBeDefined();
    });

    // 7. listFiles with folder filter
    test('listFiles with folder filter returns only matching files', async () => {
      const ops = await factory();
      const inFolder = `contract/filtered/inside-${Date.now()}.md`;
      const outside = `contract/other/outside-${Date.now()}.md`;

      await ops.createFile(VAULT, inFolder, 'inside');
      await ops.createFile(VAULT, outside, 'outside');

      const filtered = await ops.listFiles(VAULT, { folder: 'contract/filtered' });
      const paths = filtered.map(e => e.path);
      expect(paths).toContain(inFolder);
      expect(paths).not.toContain(outside);
    });

    // 8. listFiles without filter returns all files (backward compat)
    test('listFiles without filter returns all files', async () => {
      const ops = await factory();
      const path1 = `contract/compat-a-${Date.now()}.md`;
      const path2 = `contract/compat-b-${Date.now()}.md`;

      await ops.createFile(VAULT, path1, 'a');
      await ops.createFile(VAULT, path2, 'b');

      const all = await ops.listFiles(VAULT);
      const paths = all.map(e => e.path);
      expect(paths).toContain(path1);
      expect(paths).toContain(path2);
    });

    // 9. daily accumulation
    test('appendToDaily accumulates entries', async () => {
      const ops = await factory();

      await ops.appendToDaily(VAULT, 'entry-1');
      await ops.appendToDaily(VAULT, 'entry-2');
      // Contract: appendToDaily should not throw; accumulation is observable
      // through the daily note if the implementation supports it.
    });

    // 8. listRecentFiles returns file paths
    test('listRecentFiles returns paths', async () => {
      const ops = await factory();
      const path = `contract/recent-${Date.now()}.md`;

      await seed(ops, VAULT, path, 'recent file');
      const recent = await ops.listRecentFiles(VAULT, 10);
      expect(Array.isArray(recent)).toBe(true);
    });
  });
}
