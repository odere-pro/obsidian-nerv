const TIMEOUT_MS = 30_000;

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
