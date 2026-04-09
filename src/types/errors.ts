/**
 * Custom error hierarchy for structured, typed error handling.
 *
 * All domain errors extend NervError, which carries a machine-readable `code`
 * discriminator. Commands return CommandResult<T>; the CLI layer catches
 * NervError subtypes and translates them to exit codes and output.
 */

export abstract class NervError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Thrown when user input or domain data violates a constraint. */
export class ValidationError extends NervError {
  readonly code = 'VALIDATION';

  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

/** Thrown when a vault I/O operation fails. */
export class VaultIOError extends NervError {
  readonly code = 'VAULT_IO';

  constructor(
    message: string,
    readonly path?: string
  ) {
    super(message);
  }
}

/** Thrown when a shell command exceeds its timeout. */
export class TimeoutError extends NervError {
  readonly code = 'TIMEOUT';

  constructor(
    message: string,
    readonly command?: string
  ) {
    super(message);
  }
}

/** Thrown when a referenced entity or file is not found. */
export class NotFoundError extends NervError {
  readonly code = 'NOT_FOUND';

  constructor(
    message: string,
    readonly target?: string
  ) {
    super(message);
  }
}
