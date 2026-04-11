/**
 * VaultOps implementation backed by the Obsidian CLI.
 *
 * Each method translates a domain-level vault operation into an Obsidian JS
 * expression evaluated via obEval, or a shell command via spawnCapture.
 */

import { encodeForJs, parseJson } from '../lib/json';
import { dailyAppend, obEval } from '../lib/obsidian';
import { retrySpawn } from '../lib/shell';
import { VaultIOError } from '../types/errors';
import type { ListFilesFilter, VaultFile, VaultFileEntry, VaultOps } from '../ports/vault-ops';

const e = encodeForJs;

/**
 * Production VaultOps adapter backed by the Obsidian CLI.
 * Every string argument embedded in an obEval expression passes through encodeForJs.
 * @implements {VaultOps}
 */
export class ObsidianCliAdapter implements VaultOps {
  async fileExists(vault: string, path: string): Promise<boolean> {
    const raw = await obEval(
      vault,
      `app.vault.getAbstractFileByPath(${e(path)}) ? 'exists' : 'absent'`
    );
    return raw === 'exists';
  }

  async readFile(vault: string, path: string): Promise<VaultFile> {
    const raw = await obEval(
      vault,
      `(async () => { const f = app.vault.getAbstractFileByPath(${e(path)}); return JSON.stringify({content: await app.vault.cachedRead(f), frontmatter: app.metadataCache.getFileCache(f)?.frontmatter ?? {}}); })()`
    );
    const parsed = parseJson<{ content: string; frontmatter: Record<string, unknown> }>(raw);
    if (!parsed) {
      throw new VaultIOError(`readFile: failed to parse response for ${path}`, path);
    }
    return { path, ...parsed };
  }

  async readFiles(vault: string, paths: string[]): Promise<VaultFile[]> {
    if (paths.length === 0) return [];
    const pathsJson = JSON.stringify(paths);
    const raw = await obEval(
      vault,
      `(async () => { const paths = ${pathsJson}; const out = []; for (const p of paths) { const f = app.vault.getAbstractFileByPath(p); out.push({path: p, content: await app.vault.cachedRead(f), frontmatter: app.metadataCache.getFileCache(f)?.frontmatter ?? {}}); } return JSON.stringify(out); })()`
    );
    return parseJson<VaultFile[]>(raw) ?? [];
  }

  async createFile(vault: string, path: string, content: string): Promise<void> {
    await obEval(
      vault,
      `(async () => { const dir = ${e(path)}.split('/').slice(0, -1).join('/'); if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir); await app.vault.create(${e(path)}, ${e(content)}); return 'ok'; })()`
    );
  }

  async updateFrontmatter(
    vault: string,
    path: string,
    mutations: Record<string, unknown>
  ): Promise<void> {
    await obEval(
      vault,
      `(async () => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${e(path)}), fm => { const m = ${JSON.stringify(mutations)}; for (const k of Object.keys(m)) fm[k] = m[k]; }); return 'ok'; })()`
    );
  }

  async listFiles(vault: string, filter?: ListFilesFilter): Promise<VaultFileEntry[]> {
    const folderFilter =
      filter?.folder != null
        ? `.filter(f => f.path.startsWith(${e(filter.folder.endsWith('/') ? filter.folder : filter.folder + '/')}))`
        : '';
    const raw = await obEval(
      vault,
      `JSON.stringify(app.vault.getMarkdownFiles()${folderFilter}.map(f => ({path: f.path, frontmatter: app.metadataCache.getFileCache(f)?.frontmatter ?? {}})))`
    );
    return parseJson<VaultFileEntry[]>(raw) ?? [];
  }

  async appendToDaily(vault: string, content: string): Promise<void> {
    await dailyAppend(vault, content);
  }

  async openDaily(vault: string): Promise<void> {
    await retrySpawn(['obsidian', `vault=${vault}`, 'daily']);
  }

  async listRecentFiles(vault: string, limit: number, sort?: string): Promise<string[]> {
    const { stdout } = await retrySpawn([
      'obsidian',
      `vault=${vault}`,
      'files',
      `sort=${sort ?? 'modified'}`,
      `limit=${limit}`,
      '--copy',
    ]);
    return stdout
      .trim()
      .split('\n')
      .filter(l => l.length > 0);
  }

  async listUnresolved(vault: string): Promise<string[]> {
    const { stdout } = await retrySpawn(['obsidian', `vault=${vault}`, 'unresolved']);
    return stdout
      .trim()
      .split('\n')
      .filter(l => l.length > 0);
  }

  async trashFile(vault: string, path: string): Promise<void> {
    await obEval(
      vault,
      `(async () => { await app.vault.trash(app.vault.getAbstractFileByPath(${e(path)}), false); return 'ok'; })()`
    );
  }

  async appendToFile(vault: string, path: string, content: string): Promise<void> {
    await obEval(
      vault,
      `(async () => { await app.vault.append(app.vault.getAbstractFileByPath(${e(path)}), ${e(content)}); return 'ok'; })()`
    );
  }

  async replaceFileContent(vault: string, path: string, content: string): Promise<void> {
    await obEval(
      vault,
      `(async () => { await app.vault.modify(app.vault.getAbstractFileByPath(${e(path)}), ${e(content)}); return 'ok'; })()`
    );
  }
}
