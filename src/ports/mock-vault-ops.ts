/**
 * MockVaultOps — Map-backed in-memory VaultOps implementation for tests.
 * Commands unit tests use this instead of mocking Obsidian internals.
 */

import type { ListFilesFilter, VaultFile, VaultFileEntry, VaultOps } from './vault-ops';

interface StoredFile {
  content: string;
  frontmatter: Record<string, unknown>;
}

/** A single recorded call: method name, arguments, and timestamp. */
export interface TrackedCall {
  method: string;
  args: unknown[];
  timestamp: number;
}

/**
 * Records method calls on MockVaultOps for test assertions.
 * Use to detect N+1 regressions and verify call patterns.
 */
export class CallTracker {
  private log: TrackedCall[] = [];

  /** Record a method invocation. */
  record(method: string, args: unknown[]): void {
    this.log.push({ method, args, timestamp: Date.now() });
  }

  /** Return all recorded calls for a method. */
  calls(method: string): TrackedCall[] {
    return this.log.filter(c => c.method === method);
  }

  /** Return the number of times a method was called. */
  callCount(method: string): number {
    return this.calls(method).length;
  }

  /** Clear all recorded calls (e.g. between test phases). */
  reset(): void {
    this.log = [];
  }
}

/**
 * In-memory VaultOps implementation for unit tests.
 * Must not be imported in production code — test use only.
 * @implements {VaultOps}
 */
export class MockVaultOps implements VaultOps {
  readonly tracker = new CallTracker();
  private files = new Map<string, Map<string, StoredFile>>();
  private dailyEntries = new Map<string, string[]>();
  private trashedPaths: string[] = [];

  /**
   * Seed a file into the in-memory vault for test setup.
   * Call this in beforeEach to establish preconditions before exercising a command.
   */
  seedFile(
    vault: string,
    path: string,
    content: string,
    frontmatter: Record<string, unknown> = {}
  ): void {
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
    this.tracker.record('fileExists', [vault, path]);
    return this.vaultMap(vault).has(path);
  }

  async readFile(vault: string, path: string): Promise<VaultFile> {
    this.tracker.record('readFile', [vault, path]);
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    return { path, content: stored.content, frontmatter: { ...stored.frontmatter } };
  }

  async readFiles(vault: string, paths: string[]): Promise<VaultFile[]> {
    this.tracker.record('readFiles', [vault, paths]);
    const results: VaultFile[] = [];
    for (const path of paths) {
      const stored = this.vaultMap(vault).get(path);
      if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
      results.push({ path, content: stored.content, frontmatter: { ...stored.frontmatter } });
    }
    return results;
  }

  async createFile(vault: string, path: string, content: string): Promise<void> {
    this.tracker.record('createFile', [vault, path, content]);
    const vm = this.vaultMap(vault);
    if (vm.has(path)) throw new Error(`MockVaultOps: file already exists: ${path}`);
    vm.set(path, { content, frontmatter: {} });
  }

  async updateFrontmatter(
    vault: string,
    path: string,
    mutations: Record<string, unknown>
  ): Promise<void> {
    this.tracker.record('updateFrontmatter', [vault, path, mutations]);
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    Object.assign(stored.frontmatter, mutations);
  }

  async listFiles(vault: string, filter?: ListFilesFilter): Promise<VaultFileEntry[]> {
    this.tracker.record('listFiles', [vault, filter]);
    const folderPrefix =
      filter?.folder != null
        ? filter.folder.endsWith('/')
          ? filter.folder
          : filter.folder + '/'
        : null;
    const entries: VaultFileEntry[] = [];
    for (const [path, stored] of this.vaultMap(vault)) {
      if (folderPrefix && !path.startsWith(folderPrefix)) continue;
      entries.push({ path, frontmatter: { ...stored.frontmatter } });
    }
    return entries;
  }

  async appendToDaily(vault: string, content: string): Promise<void> {
    this.tracker.record('appendToDaily', [vault, content]);
    if (!this.dailyEntries.has(vault)) this.dailyEntries.set(vault, []);
    this.dailyEntries.get(vault)!.push(content);
  }

  async openDaily(_vault: string): Promise<void> {
    this.tracker.record('openDaily', [_vault]);
    /* No-op in mock — there is no UI to open */
  }

  async listRecentFiles(vault: string, limit: number, _sort?: string): Promise<string[]> {
    this.tracker.record('listRecentFiles', [vault, limit, _sort]);
    const paths = [...this.vaultMap(vault).keys()];
    return paths.slice(0, limit);
  }

  async listUnresolved(_vault: string): Promise<string[]> {
    this.tracker.record('listUnresolved', [_vault]);
    /* Mock returns empty — no link resolution engine */
    return [];
  }

  async trashFile(vault: string, path: string): Promise<void> {
    this.tracker.record('trashFile', [vault, path]);
    const vm = this.vaultMap(vault);
    if (!vm.has(path)) throw new Error(`MockVaultOps: file not found: ${path}`);
    vm.delete(path);
    this.trashedPaths.push(path);
  }

  async appendToFile(vault: string, path: string, content: string): Promise<void> {
    this.tracker.record('appendToFile', [vault, path, content]);
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    stored.content += content;
  }

  async replaceFileContent(vault: string, path: string, content: string): Promise<void> {
    this.tracker.record('replaceFileContent', [vault, path, content]);
    const stored = this.vaultMap(vault).get(path);
    if (!stored) throw new Error(`MockVaultOps: file not found: ${path}`);
    stored.content = content;
  }
}
