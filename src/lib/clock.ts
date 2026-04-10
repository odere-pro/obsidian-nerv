/**
 * Clock abstraction for testable date/time operations.
 *
 * Replaces direct `new Date()` calls scattered across commands, making
 * time-dependent logic deterministic in tests.
 */

export interface Clock {
  /** Return the current Date. */
  now(): Date;
  /** Return today's date as YYYY-MM-DD. */
  today(): string;
  /** Return an ISO timestamp truncated to minutes (YYYY-MM-DD HH:MM). */
  timestamp(): string;
}

/** Production clock backed by the system clock. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  timestamp(): string {
    return this.now().toISOString().replace('T', ' ').slice(0, 16);
  }
}

/** Test clock returning a fixed point in time. */
export class FixedClock implements Clock {
  constructor(private readonly date: Date) {}

  now(): Date {
    return this.date;
  }

  today(): string {
    return this.date.toISOString().slice(0, 10);
  }

  timestamp(): string {
    return this.date.toISOString().replace('T', ' ').slice(0, 16);
  }
}

/** Default singleton — commands import this; tests can replace via setClock(). */
let clock: Clock = new SystemClock();

export function getClock(): Clock {
  return clock;
}

export function setClock(c: Clock): void {
  clock = c;
}
