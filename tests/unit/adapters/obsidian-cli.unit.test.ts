import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as obsidianLib from '../../../src/lib/obsidian';
import * as shellLib from '../../../src/lib/shell';
import { ObsidianCliAdapter } from '../../../src/adapters/obsidian-cli';

// ---------------------------------------------------------------------------
// Tests — uses spyOn on live ESM exports instead of mock.module to avoid
// cross-file contamination in Bun's test runner.
// ---------------------------------------------------------------------------

describe('ObsidianCliAdapter', () => {
  let adapter: ObsidianCliAdapter;
  let mockObEval: ReturnType<typeof spyOn<typeof obsidianLib, 'obEval'>>;
  let mockDailyAppend: ReturnType<typeof spyOn<typeof obsidianLib, 'dailyAppend'>>;
  let mockSpawnCapture: ReturnType<typeof spyOn<typeof shellLib, 'spawnCapture'>>;

  beforeEach(() => {
    mockObEval = spyOn(obsidianLib, 'obEval').mockResolvedValue('');
    mockDailyAppend = spyOn(obsidianLib, 'dailyAppend').mockResolvedValue(undefined);
    mockSpawnCapture = spyOn(shellLib, 'spawnCapture').mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    adapter = new ObsidianCliAdapter();
  });

  afterEach(() => {
    mock.restore();
  });

  test('fileExists returns true when obEval returns "exists"', async () => {
    mockObEval.mockResolvedValue('exists');
    const result = await adapter.fileExists('v', 'notes/test.md');
    expect(result).toBe(true);
    expect(mockObEval.mock.calls[0][1]).toContain("'exists'");
    expect(mockObEval.mock.calls[0][1]).toContain("'absent'");
  });

  test('fileExists returns false when obEval returns "absent"', async () => {
    mockObEval.mockResolvedValue('absent');
    const result = await adapter.fileExists('v', 'notes/test.md');
    expect(result).toBe(false);
  });

  test('readFile parses VaultFile from obEval JSON', async () => {
    mockObEval.mockResolvedValue(JSON.stringify({ content: 'body', frontmatter: { title: 'T' } }));
    const result = await adapter.readFile('v', 'notes/test.md');
    expect(result.path).toBe('notes/test.md');
    expect(result.content).toBe('body');
    expect(result.frontmatter).toEqual({ title: 'T' });
  });

  test('createFile calls obEval with app.vault.create', async () => {
    mockObEval.mockResolvedValue('');
    await adapter.createFile('v', 'new.md', '# Hello');
    expect(mockObEval.mock.calls[0][1]).toContain('app.vault.create');
  });

  test('updateFrontmatter calls obEval with processFrontMatter and mutations', async () => {
    mockObEval.mockResolvedValue('');
    await adapter.updateFrontmatter('v', 'note.md', { status: 'done', count: 3 });
    const expr = mockObEval.mock.calls[0][1] as string;
    expect(expr).toContain('processFrontMatter');
    expect(expr).toContain('"status":"done"');
    expect(expr).toContain('"count":3');
  });

  test('listFiles returns typed VaultFileEntry[]', async () => {
    const entries = [
      { path: 'a.md', frontmatter: { title: 'A' } },
      { path: 'b.md', frontmatter: {} },
    ];
    mockObEval.mockResolvedValue(JSON.stringify(entries));
    const result = await adapter.listFiles('v');
    expect(result).toEqual(entries);
  });

  test('appendToDaily delegates to dailyAppend', async () => {
    mockDailyAppend.mockResolvedValue(undefined);
    await adapter.appendToDaily('v', 'hello');
    expect(mockDailyAppend).toHaveBeenCalledWith('v', 'hello');
  });

  test('openDaily calls spawnCapture with obsidian daily', async () => {
    mockSpawnCapture.mockResolvedValue({ stdout: '', exitCode: 0, stderr: '' });
    await adapter.openDaily('test-vault');
    expect(mockSpawnCapture.mock.calls[0][0]).toEqual(['obsidian', 'vault=test-vault', 'daily']);
  });

  test('listRecentFiles splits stdout lines', async () => {
    mockSpawnCapture.mockResolvedValue({
      stdout: 'file1.md\nfile2.md\n',
      exitCode: 0,
      stderr: '',
    });
    const result = await adapter.listRecentFiles('v', 5, 'created');
    expect(result).toEqual(['file1.md', 'file2.md']);
    const args = mockSpawnCapture.mock.calls[0][0] as string[];
    expect(args).toContain('limit=5');
    expect(args).toContain('sort=created');
  });

  test('listRecentFiles defaults sort to modified', async () => {
    mockSpawnCapture.mockResolvedValue({ stdout: 'a.md\n', exitCode: 0, stderr: '' });
    await adapter.listRecentFiles('v', 10);
    const args = mockSpawnCapture.mock.calls[0][0] as string[];
    expect(args).toContain('sort=modified');
  });

  test('listUnresolved splits stdout lines', async () => {
    mockSpawnCapture.mockResolvedValue({
      stdout: 'link1\nlink2\n',
      exitCode: 0,
      stderr: '',
    });
    const result = await adapter.listUnresolved('v');
    expect(result).toEqual(['link1', 'link2']);
  });

  test('trashFile calls obEval with app.vault.trash', async () => {
    mockObEval.mockResolvedValue('');
    await adapter.trashFile('v', 'old.md');
    expect(mockObEval.mock.calls[0][1]).toContain('app.vault.trash');
  });

  test('appendToFile calls obEval with app.vault.append', async () => {
    mockObEval.mockResolvedValue('');
    await adapter.appendToFile('v', 'note.md', 'extra');
    expect(mockObEval.mock.calls[0][1]).toContain('app.vault.append');
  });

  test('replaceFileContent calls obEval with app.vault.modify', async () => {
    mockObEval.mockResolvedValue('');
    await adapter.replaceFileContent('v', 'note.md', 'new content');
    expect(mockObEval.mock.calls[0][1]).toContain('app.vault.modify');
  });
});
