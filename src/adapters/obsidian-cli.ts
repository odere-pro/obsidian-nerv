/**
 * VaultOps implementation backed by the Obsidian CLI.
 *
 * Each method translates a domain-level vault operation into an Obsidian JS
 * expression evaluated via obEval, or a shell command via spawnCapture.
 */

import { encodeForJs, parseJson } from '../lib/json';
import { logError } from '../lib/logger';
import { dailyAppend, obEval } from '../lib/obsidian';
import { spawnCapture } from '../lib/shell';
import type { VaultFile, VaultFileEntry, VaultOps } from '../ports/vault-ops';

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
      logError(`readFile: failed to parse response for ${path}`);
    }
    return { path, ...parsed };
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

  async listFiles(vault: string): Promise<VaultFileEntry[]> {
    const raw = await obEval(
      vault,
      `JSON.stringify(app.vault.getMarkdownFiles().map(f => ({path: f.path, frontmatter: app.metadataCache.getFileCache(f)?.frontmatter ?? {}})))`
    );
    return parseJson<VaultFileEntry[]>(raw) ?? [];
  }

  async appendToDaily(vault: string, content: string): Promise<void> {
    await dailyAppend(vault, content);
  }

  async openDaily(vault: string): Promise<void> {
    await spawnCapture(['obsidian', `vault=${vault}`, 'daily']);
  }

  async listRecentFiles(vault: string, limit: number, sort?: string): Promise<string[]> {
    const { stdout } = await spawnCapture([
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
    const { stdout } = await spawnCapture(['obsidian', `vault=${vault}`, 'unresolved']);
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
