import { describe, expect, test } from 'bun:test';
import { ShellTimeoutError, spawnCapture } from '../shell';

describe('spawnCapture', () => {
  test('captures stdout from echo', async () => {
    const { stdout, exitCode } = await spawnCapture(['echo', 'hello world']);
    expect(stdout.trim()).toBe('hello world');
    expect(exitCode).toBe(0);
  });

  test('captures stderr from a command that writes to stderr', async () => {
    // bash -c 'echo err >&2' writes to stderr
    const { stderr, stdout, exitCode } = await spawnCapture(['bash', '-c', 'echo err >&2']);
    expect(stderr.trim()).toBe('err');
    expect(stdout.trim()).toBe('');
    expect(exitCode).toBe(0);
  });

  test('returns non-zero exit code for failing commands', async () => {
    const { exitCode } = await spawnCapture(['bash', '-c', 'exit 42']);
    expect(exitCode).toBe(42);
  });

  test('captures multi-line output correctly', async () => {
    const { stdout } = await spawnCapture(['bash', '-c', "printf 'a\\nb\\nc\\n'"]);
    expect(stdout).toBe('a\nb\nc\n');
  });

  test('ShellTimeoutError is an Error subclass', () => {
    const err = new ShellTimeoutError('test-cmd');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ShellTimeoutError);
    expect(err.name).toBe('ShellTimeoutError');
    expect(err.message).toContain('test-cmd');
  });
});
