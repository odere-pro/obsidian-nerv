import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as shellLib from '../../../src/lib/shell';
import * as loggerLib from '../../../src/lib/logger';
import { ObsidianDevAdapter } from '../../../src/adapters/obsidian-dev';

// ---------------------------------------------------------------------------
// Tests — uses spyOn on live ESM exports instead of mock.module to avoid
// cross-file contamination in Bun's test runner.
// ---------------------------------------------------------------------------

describe('ObsidianDevAdapter', () => {
  let adapter: ObsidianDevAdapter;
  let mockSpawnCapture: ReturnType<typeof spyOn<typeof shellLib, 'spawnCapture'>>;
  let mockLogError: ReturnType<typeof spyOn<typeof loggerLib, 'logError'>>;

  beforeEach(() => {
    mockSpawnCapture = spyOn(shellLib, 'spawnCapture').mockResolvedValue({
      stdout: '',
      exitCode: 0,
      stderr: '',
    });
    mockLogError = spyOn(loggerLib, 'logError').mockImplementation(((msg: string) => {
      throw new Error(msg);
    }) as unknown as typeof loggerLib.logError);
    adapter = new ObsidianDevAdapter();
  });

  afterEach(() => {
    mock.restore();
  });

  test('reloadPlugin calls spawnCapture with correct args', async () => {
    mockSpawnCapture.mockResolvedValue({ stdout: '', exitCode: 0, stderr: '' });
    await adapter.reloadPlugin('v', 'my-plugin');
    expect(mockSpawnCapture.mock.calls[0][0]).toEqual([
      'obsidian',
      'plugin:reload',
      'vault=v',
      'plugin=my-plugin',
    ]);
  });

  test('reloadPlugin calls logError on non-zero exit code', async () => {
    mockSpawnCapture.mockResolvedValue({ stdout: '', exitCode: 1, stderr: 'fail' });
    mockLogError.mockImplementation((() => {
      throw new Error('exit');
    }) as unknown as typeof loggerLib.logError);
    expect(() => adapter.reloadPlugin('v', 'my-plugin')).toThrow('exit');
    // Wait for the async rejection to settle
    await Bun.sleep(0);
    expect(mockLogError).toHaveBeenCalled();
  });

  test('captureErrors calls spawnCapture and returns stdout', async () => {
    mockSpawnCapture.mockResolvedValue({ stdout: 'err1\nerr2\n', exitCode: 0, stderr: '' });
    const result = await adapter.captureErrors('v');
    expect(result).toBe('err1\nerr2\n');
    expect(mockSpawnCapture.mock.calls[0][0]).toEqual(['obsidian', 'dev:errors', 'vault=v']);
  });

  test('captureConsole calls spawnCapture and returns stdout', async () => {
    mockSpawnCapture.mockResolvedValue({ stdout: 'log line\n', exitCode: 0, stderr: '' });
    const result = await adapter.captureConsole('v');
    expect(result).toBe('log line\n');
    expect(mockSpawnCapture.mock.calls[0][0]).toEqual(['obsidian', 'dev:console', 'vault=v']);
  });

  test('captureScreenshot calls spawnCapture and returns stdout', async () => {
    mockSpawnCapture.mockResolvedValue({ stdout: '/tmp/shot.png\n', exitCode: 0, stderr: '' });
    const result = await adapter.captureScreenshot('v');
    expect(result).toBe('/tmp/shot.png\n');
    expect(mockSpawnCapture.mock.calls[0][0]).toEqual(['obsidian', 'dev:screenshot', 'vault=v']);
  });
});
