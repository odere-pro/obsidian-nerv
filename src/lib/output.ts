/**
 * Output Strategy — unified output formatting for CLI commands.
 *
 * Replaces per-command --json handling with a polymorphic strategy.
 * Commands call strategy methods; the strategy decides the format.
 */

export interface OutputStrategy {
  /** Write a successful result. */
  success<T>(data: T): void;
  /** Write an error and exit with code 1. */
  error(msg: string): never;
  /** Write an informational message (suppressed in JSON mode). */
  info(msg: string): void;
  /** Write a warning message to stderr. */
  warn(msg: string): void;
}

/** Human-readable text output to stdout/stderr. */
export class TextOutput implements OutputStrategy {
  success<T>(data: T): void {
    if (typeof data === 'string') {
      process.stdout.write(data + '\n');
    } else {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    }
  }

  error(msg: string): never {
    process.stderr.write(`ERROR: ${msg}\n`);
    process.exit(1);
  }

  info(msg: string): void {
    process.stdout.write(`INFO: ${msg}\n`);
  }

  warn(msg: string): void {
    process.stderr.write(`WARN: ${msg}\n`);
  }
}

/** Machine-readable JSON output (one JSON line per result). */
export class JsonOutput implements OutputStrategy {
  success<T>(data: T): void {
    process.stdout.write(JSON.stringify(data) + '\n');
  }

  error(msg: string): never {
    process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    process.exit(1);
  }

  info(_msg: string): void {
    /* suppressed in JSON mode */
  }

  warn(msg: string): void {
    process.stderr.write(`WARN: ${msg}\n`);
  }
}

/** Select the appropriate output strategy based on the --json flag. */
export function selectOutput(jsonOutput: boolean): OutputStrategy {
  return jsonOutput ? new JsonOutput() : new TextOutput();
}
