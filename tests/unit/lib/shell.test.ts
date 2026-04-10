import { describe, expect, test } from 'bun:test';
import { ShellTimeoutError, parallel, spawnCapture } from '../../../src/lib/shell';

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

/* ---------------------------------------------------------------------------
 * parallel()
 * --------------------------------------------------------------------------- */

describe('parallel', () => {
  test('returns results in input order regardless of completion order', async () => {
    const tasks = [
      () => new Promise<string>(r => setTimeout(() => r('slow'), 30)),
      () => Promise.resolve('fast'),
      () => new Promise<string>(r => setTimeout(() => r('medium'), 10)),
    ];

    const results = await parallel(tasks);
    const values = results.map(r => (r.status === 'fulfilled' ? r.value : null));
    expect(values).toEqual(['slow', 'fast', 'medium']);
  });

  test('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;

    const makeTask = () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 10));
      running--;
      return true;
    };

    const tasks = Array.from({ length: 20 }, makeTask);
    await parallel(tasks, { concurrency: 3 });

    expect(maxRunning).toBeLessThanOrEqual(3);
  });

  test('collects failures without aborting remaining tasks', async () => {
    const tasks = [
      () => Promise.resolve('ok-1'),
      () => Promise.reject(new Error('boom')),
      () => Promise.resolve('ok-2'),
    ];

    const results = await parallel(tasks, { concurrency: 2 });

    expect(results[0]).toMatchObject({ status: 'fulfilled', value: 'ok-1' });
    expect(results[1]).toMatchObject({ status: 'rejected' });
    expect(results[2]).toMatchObject({ status: 'fulfilled', value: 'ok-2' });
  });

  test('handles empty task list', async () => {
    const results = await parallel([]);
    expect(results).toEqual([]);
  });

  test('defaults to concurrency of 10', async () => {
    let running = 0;
    let maxRunning = 0;

    const makeTask = () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(r => setTimeout(r, 5));
      running--;
      return true;
    };

    const tasks = Array.from({ length: 30 }, makeTask);
    await parallel(tasks);

    expect(maxRunning).toBeLessThanOrEqual(10);
    expect(maxRunning).toBeGreaterThan(1);
  });
});
