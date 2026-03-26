// STORY-031 — Bun CLI foundation: logger

/**
 * Write an error message to stderr and terminate the process with exit code 1.
 * Declared as `never` because execution does not continue after this call.
 */
export function logError(msg: string): never {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(1);
}

/**
 * Write a warning message to stderr. Does not exit.
 */
export function logWarn(msg: string): void {
  process.stderr.write(`WARN: ${msg}\n`);
}
