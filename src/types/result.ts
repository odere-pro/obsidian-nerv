// STORY-031 — Bun CLI foundation: result types

export interface CommandResult<T> {
  ok: boolean;
  data: T;
  error?: string;
}

export type ExitCode = 0 | 1;
