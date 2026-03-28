// MockVaultOps — Map-backed in-memory VaultOps implementation for tests.
// Commands unit tests use this instead of mocking Obsidian internals.

import type { VaultFile, VaultFileEntry, VaultOps } from './vault-ops';

interface StoredFile {
  content: string;
  frontmatter: Record<string, unknown>;
}

export class MockVaultOps implements VaultOps {
  private files = new Map<string, Map<string, StoredFile>>();
  private dailyEntries = new Map<string, string[]>();
  private trashedPaths: string[] = [];

  /** Seed a file into the in-memory vault for test setup. */
  seedFile(vault: string, path: string, content: string, frontmatter: Record<string, unknown> = {}): void {
    if (!this.files.has(vault)) this.files.set(vault, new Map());
    this.files.get(vault)!.set(path, { content, frontmatter: { ...frontmatter } });
  }

  /** Return paths that were trashed (for test assertions). */
  getTrashedPaths(): string[] {
    return [...this.trashedPaths];
  }

  /** Return daily entries accumulated for a vault. */
  getDailyEntries(vault: string): string[] {
    return [...(this.dailyEntries.get(vault) ?? [])];
  }

  private vaultMap(vault: string): Map<string, StoredFile> {
    if (!this.files.has(vault)) this.files.set(vault, new Map());
    return this.files.get(vault)!;
  }

  async fileExists(vault: string, path: string): Promise<boolean> {
    return this.vaultMap(vault).has(path);
  }

  async readFile(vault: string, path: string): Promise<VaultFile> {
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    return { path, content: stored.content, frontmatter: { ...stored.frontmatter } };
  }

  async createFile(vault: string, path: string, content: string): Promise<void> {
    const vm = this.vaultMap(vault);
    if (vm.has(path)) throw new Error(`MockVaultOps: file already exists: ${path}`);
    vm.set(path, { content, frontmatter: {} });
  }

  async updateFrontmatter(vault: string, path: string, mutations: Record<string, unknown>): Promise<void> {
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    Object.assign(stored.frontmatter, mutations);
  }

  async listFiles(vault: string): Promise<VaultFileEntry[]> {
    const entries: VaultFileEntry[] = [];
    for (const [path, stored] of this.vaultMap(vault)) {
      entries.push({ path, frontmatter: { ...stored.frontmatter } });
    }
    return entries;
  }

  async appendToDaily(vault: string, content: string): Promise<void> {
    if (!this.dailyEntries.has(vault)) this.dailyEntries.set(vault, []);
    this.dailyEntries.get(vault)!.push(content);
  }

  async openDaily(_vault: string): Promise<void> {
    // No-op in mock — there is no UI to open.
  }

  async listRecentFiles(vault: string, limit: number, _sort?: string): Promise<string[]> {
    const paths = [...this.vaultMap(vault).keys()];
    return paths.slice(0, limit);
  }

  async listUnresolved(_vault: string): Promise<string[]> {
    // Mock returns empty — no link resolution engine.
    return [];
  }

  async trashFile(vault: string, path: string): Promise<void> {
    const vm = this.vaultMap(vault);
    if (!vm.has(path)) throw new Error(`MockVaultOps: file not found: ${path}`);
    vm.delete(path);
    this.trashedPaths.push(path);
  }

  async appendToFile(vault: string, path: string, content: string): Promise<void> {
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    stored.content += content;
  }

  async replaceFileContent(vault: string, path: string, content: string): Promise<void> {
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    stored.content = content;
  }
}
