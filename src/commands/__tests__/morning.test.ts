// STORY-036 — morning unit tests
// Tests 4-step sequence and cron documentation. No Obsidian required.

import { describe, expect, test } from 'bun:test';
import { runMorning, CRON_ENTRY, type MorningDeps } from '../morning.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SpawnResult = { stdout: string; stderr: string; exitCode: number };

function makeSpawn(responses: SpawnResult[]): MorningDeps['spawnCapture'] {
  let idx = 0;
  return (..._args: unknown[]) => {
    const r = responses[idx] ?? { stdout: '', stderr: '', exitCode: 0 };
    idx++;
    return Promise.resolve(r) as Promise<SpawnResult>;
  };
}

// ---------------------------------------------------------------------------
// 4-step sequence
// ---------------------------------------------------------------------------

describe('runMorning', () => {
  test('spawnCapture is called 4 times (daily, eval, daily:append, files, unresolved)', async () => {
    let callCount = 0;
    const deps: MorningDeps = {
      spawnCapture: (..._args: unknown[]) => {
        callCount++;
        return Promise.resolve({ stdout: '5', stderr: '', exitCode: 0 }) as Promise<SpawnResult>;
      },
    };
    await runMorning('testvault', deps);
    // Steps: daily, eval (inbox count), daily:append, files sort=modified, unresolved = 5 calls
    expect(callCount).toBeGreaterThanOrEqual(4);
  });

  test('inboxCount in result matches eval stdout', async () => {
    const deps: MorningDeps = {
      spawnCapture: makeSpawn([
        { stdout: '', stderr: '', exitCode: 0 }, // step 1: daily
        { stdout: '=> 7', stderr: '', exitCode: 0 }, // step 2a: eval
        { stdout: '', stderr: '', exitCode: 0 }, // step 2b: daily:append
        { stdout: '', stderr: '', exitCode: 0 }, // step 3: files
        { stdout: '', stderr: '', exitCode: 0 }, // step 4: unresolved
      ]),
    };
    const result = await runMorning('vault', deps);
    expect(result.inboxCount).toBe(7);
  });

  test('unresolvedCount is 0 when obsidian unresolved returns empty', async () => {
    const deps: MorningDeps = {
      spawnCapture: makeSpawn([
        { stdout: '', stderr: '', exitCode: 0 },
        { stdout: '=> 0', stderr: '', exitCode: 0 },
        { stdout: '', stderr: '', exitCode: 0 },
        { stdout: '', stderr: '', exitCode: 0 },
        { stdout: '', stderr: '', exitCode: 0 },
      ]),
    };
    const result = await runMorning('vault', deps);
    expect(result.unresolvedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cron documentation
// ---------------------------------------------------------------------------

describe('CRON_ENTRY', () => {
  test('cron entry matches weekday 08:00 pattern', () => {
    expect(CRON_ENTRY).toContain('0 8 * * 1-5');
  });

  test('cron entry references nerv morning', () => {
    expect(CRON_ENTRY).toContain('nerv morning');
  });
});
