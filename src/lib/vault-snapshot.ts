/**
 * VaultSnapshot — Caching decorator for VaultOps.
 *
 * Wraps any VaultOps implementation and caches the results of
 * listFiles() and readFile()/readFiles() for the lifetime of
 * the snapshot. Write operations (createFile, updateFrontmatter, etc.)
 * pass through to the delegate and invalidate the relevant cache entries.
 *
 * Used by weekly-review orchestration to avoid redundant IPC calls
 * when multiple sub-commands read the same vault data.
 */

import type { VaultFile, VaultFileEntry, VaultOps } from '../ports/vault-ops';

export class VaultSnapshot implements VaultOps {
  private listCache = new Map<string, VaultFileEntry[]>();
  private fileCache = new Map<string, VaultFile>();

  constructor(private readonly delegate: VaultOps) {}

  /** Cache key for a vault+path pair. */
  private key(vault: string, path: string): string {
    return `${vault}\0${path}`;
  }

  async fileExists(vault: string, path: string): Promise<boolean> {
    if (this.fileCache.has(this.key(vault, path))) return true;
    return this.delegate.fileExists(vault, path);
  }

  async readFile(vault: string, path: string): Promise<VaultFile> {
    const k = this.key(vault, path);
    const cached = this.fileCache.get(k);
    if (cached) return cached;
    const file = await this.delegate.readFile(vault, path);
    this.fileCache.set(k, file);
    return file;
  }

  async readFiles(vault: string, paths: string[]): Promise<VaultFile[]> {
    const missing: string[] = [];
    const missingIdx: number[] = [];
    const results: (VaultFile | null)[] = [];

    for (let i = 0; i < paths.length; i++) {
      const k = this.key(vault, paths[i]);
      const cached = this.fileCache.get(k);
      if (cached) {
        results.push(cached);
      } else {
        results.push(null);
        missing.push(paths[i]);
        missingIdx.push(i);
      }
    }

    if (missing.length > 0) {
      const fetched = await this.delegate.readFiles(vault, missing);
      for (let j = 0; j < fetched.length; j++) {
        const k = this.key(vault, missing[j]);
        this.fileCache.set(k, fetched[j]);
        results[missingIdx[j]] = fetched[j];
      }
    }

    return results as VaultFile[];
  }

  async listFiles(vault: string): Promise<VaultFileEntry[]> {
    const cached = this.listCache.get(vault);
    if (cached) return cached;
    const entries = await this.delegate.listFiles(vault);
    this.listCache.set(vault, entries);
    return entries;
  }

  /* Write-through methods — invalidate cache on mutation */

  async createFile(vault: string, path: string, content: string): Promise<void> {
    await this.delegate.createFile(vault, path, content);
    this.listCache.delete(vault);
    this.fileCache.delete(this.key(vault, path));
  }

  async appendToFile(vault: string, path: string, content: string): Promise<void> {
    await this.delegate.appendToFile(vault, path, content);
    this.fileCache.delete(this.key(vault, path));
  }

  async replaceFileContent(vault: string, path: string, content: string): Promise<void> {
    await this.delegate.replaceFileContent(vault, path, content);
    this.fileCache.delete(this.key(vault, path));
  }

  async trashFile(vault: string, path: string): Promise<void> {
    await this.delegate.trashFile(vault, path);
    this.listCache.delete(vault);
    this.fileCache.delete(this.key(vault, path));
  }

  async updateFrontmatter(
    vault: string,
    path: string,
    mutations: Record<string, unknown>
  ): Promise<void> {
    await this.delegate.updateFrontmatter(vault, path, mutations);
    this.fileCache.delete(this.key(vault, path));
    this.listCache.delete(vault);
  }

  async appendToDaily(vault: string, content: string): Promise<void> {
    await this.delegate.appendToDaily(vault, content);
  }

  async openDaily(vault: string): Promise<void> {
    await this.delegate.openDaily(vault);
  }

  async listRecentFiles(vault: string, limit: number, sort?: string): Promise<string[]> {
    return this.delegate.listRecentFiles(vault, limit, sort);
  }

  async listUnresolved(vault: string): Promise<string[]> {
    return this.delegate.listUnresolved(vault);
  }
}
