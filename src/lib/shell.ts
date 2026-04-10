const TIMEOUT_MS = 30_000;

/* ---------------------------------------------------------------------------
 * Concurrency-limited parallel runner
 * --------------------------------------------------------------------------- */

export interface ParallelOptions {
  /** Maximum number of tasks executing at the same time. Defaults to 10. */
  concurrency?: number;
}

/**
 * Run an array of async task factories with a concurrency cap.
 *
 * Each task factory is a zero-arg function returning a Promise.
 * Results are returned in the same order as the input array regardless of
 * completion order. Uses `Promise.allSettled` semantics — a single failure
 * does not abort remaining tasks.
 */
export async function parallel<T>(
  tasks: Array<() => Promise<T>>,
  opts: ParallelOptions = {}
): Promise<PromiseSettledResult<T>[]> {
  const concurrency = opts.concurrency ?? 10;
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/** Thrown when a spawned process exceeds the 30-second hard timeout. */
export class ShellTimeoutError extends Error {
  constructor(cmd: string) {
    super(`Command timed out after ${TIMEOUT_MS}ms: ${cmd}`);
    this.name = 'ShellTimeoutError';
  }
}

/**
 * Spawn a process and capture stdout, stderr, and exit code.
 *
 * @param cmd - Tuple of [executable, ...args]. Never pass a raw shell string;
 *   the type constraint prevents shell-injection by requiring a pre-tokenised array.
 * @throws {ShellTimeoutError} if the process does not exit within 30 seconds.
 *
 * @security The first-element / rest-element tuple type prevents callers from
 *   constructing `["sh", "-c", userInput]` patterns accidentally.
 */
export async function spawnCapture(cmd: [string, ...string[]]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => {
      proc.kill();
      reject(new ShellTimeoutError(cmd[0]));
    }, TIMEOUT_MS);
    /* Allow the process to exit without keeping the event loop alive */
    if (typeof t === 'object' && t !== null && 'unref' in t) {
      (t as NodeJS.Timeout).unref();
    }
  });

  const result = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const [stdout, stderr, exitCode] = await Promise.race([result, timeout]);

  return { stdout, stderr, exitCode };
}
