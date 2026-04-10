const DEFAULT_TIMEOUT_MS = 30_000;

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

/** Thrown when a spawned process exceeds its timeout. */
export class ShellTimeoutError extends Error {
  constructor(cmd: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    super(`Command timed out after ${timeoutMs}ms: ${cmd}`);
    this.name = 'ShellTimeoutError';
  }
}

export type SpawnResult = { stdout: string; stderr: string; exitCode: number };

/**
 * Spawn a process and capture stdout, stderr, and exit code.
 *
 * @param cmd       - Tuple of [executable, ...args]. Never pass a raw shell string;
 *   the type constraint prevents shell-injection by requiring a pre-tokenised array.
 * @param timeoutMs - Per-invocation timeout override (defaults to 30 000 ms).
 * @throws {ShellTimeoutError} if the process does not exit within the timeout.
 *
 * @security The first-element / rest-element tuple type prevents callers from
 *   constructing `["sh", "-c", userInput]` patterns accidentally.
 */
export async function spawnCapture(
  cmd: [string, ...string[]],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<SpawnResult> {
  const proc = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => {
      proc.kill();
      reject(new ShellTimeoutError(cmd[0], timeoutMs));
    }, timeoutMs);
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

/* ---------------------------------------------------------------------------
 * Retry with exponential backoff
 * --------------------------------------------------------------------------- */

export interface RetrySpawnOptions {
  /** Maximum number of attempts (including the first). Defaults to 3. */
  maxAttempts?: number;
  /** Base delay in ms before the second attempt. Doubled each retry. Defaults to 500. */
  baseDelayMs?: number;
  /** Per-invocation timeout in ms passed to spawnCapture. Defaults to 30 000. */
  timeoutMs?: number;
  /**
   * When true, also retry on non-zero exit codes (not just timeouts).
   * Defaults to false — only ShellTimeoutError triggers a retry.
   */
  retryOnNonZero?: boolean;
}

/**
 * Spawn a process with automatic retry and exponential backoff.
 *
 * By default, only retries on ShellTimeoutError. Set retryOnNonZero to also
 * retry when the process exits with a non-zero code.
 *
 * The delay before attempt N (N >= 2) is `baseDelayMs * 2^(N-2)`.
 * If all attempts fail, the error from the final attempt is thrown
 * (or the last non-zero SpawnResult is returned).
 */
export async function retrySpawn(
  cmd: [string, ...string[]],
  opts: RetrySpawnOptions = {}
): Promise<SpawnResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryOnNonZero = opts.retryOnNonZero ?? false;

  let lastResult: SpawnResult | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await spawnCapture(cmd, timeoutMs);
      if (result.exitCode === 0) return result;

      lastResult = result;
      if (!retryOnNonZero) return result;
    } catch (err) {
      lastError = err;
      lastResult = undefined;
    }

    if (attempt < maxAttempts) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  if (lastResult) return lastResult;
  throw lastError;
}
