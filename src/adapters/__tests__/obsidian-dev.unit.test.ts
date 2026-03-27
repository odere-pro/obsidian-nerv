import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSpawnCapture =
  mock<(cmd: string[]) => Promise<{ stdout: string; exitCode: number; stderr: string }>>();

const mockLogError = mock<(msg: string) => never>();

mock.module('../../lib/shell', () => ({
  spawnCapture: mockSpawnCapture,
}));

mock.module('../../lib/logger', () => ({
  logError: mockLogError,
}));

// Import after mocking
import { ObsidianDevAdapter } from '../obsidian-dev';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ObsidianDevAdapter', () => {
  let adapter: ObsidianDevAdapter;

  beforeEach(() => {
    mockSpawnCapture.mockReset();
    mockLogError.mockReset();
    adapter = new ObsidianDevAdapter();
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
    mockLogError.mockImplementation(() => {
      throw new Error('exit');
    });
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
