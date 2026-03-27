// Tests CODEPATH validation, idempotency logic, and obEval integration.

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock obsidian before importing code-link
// ---------------------------------------------------------------------------
const mockObEval = mock(
  async (_vault: string, _expr: string): Promise<string> =>
    JSON.stringify({ appended: true, note: 'projects/p/P.note.md', codePath: 'src/foo' })
);

mock.module('../../../lib/obsidian', () => ({
  resolveVault: async (arg?: string): Promise<string> => arg ?? 'test-vault',
  obEval: mockObEval,
}));

const { validateCodePath, codeLink } = await import('../../dev/code-link');

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe('validateCodePath', () => {
  test('accepts a valid code path', () => {
    expect(validateCodePath('src/commands/create-entity')).toBeNull();
  });

  test('rejects code path containing ]]', () => {
    const err = validateCodePath('src/foo]]bar');
    expect(err).not.toBeNull();
    expect(err).toContain(']]');
  });

  test('rejects code path containing newline', () => {
    const err = validateCodePath('src/foo\nbar');
    expect(err).not.toBeNull();
    expect(err).toContain('newline');
  });

  test('rejects code path containing carriage return', () => {
    const err = validateCodePath('src/foo\rbar');
    expect(err).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// codeLink tests (with mocked obEval)
// ---------------------------------------------------------------------------

describe('codeLink', () => {
  beforeEach(() => {
    mockObEval.mockReset();
  });

  test('returns ok:false for invalid code path with ]]', async () => {
    const result = await codeLink('v', 'projects/p/note.md', 'src/bad]]path');
    expect(result.ok).toBe(false);
    expect(result.error).toContain(']]');
  });

  test('returns ok:false for code path with newline', async () => {
    const result = await codeLink('v', 'projects/p/note.md', 'src/bad\npath');
    expect(result.ok).toBe(false);
  });

  test('returns appended:true when obEval reports append succeeded', async () => {
    mockObEval.mockImplementation(async () =>
      JSON.stringify({ appended: true, note: 'projects/p/note.md', codePath: 'src/foo' })
    );
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(true);
  });

  test('returns appended:false when code path already present (idempotent)', async () => {
    mockObEval.mockImplementation(async () =>
      JSON.stringify({ appended: false, note: 'projects/p/note.md', codePath: 'src/foo' })
    );
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(false);
  });

  test('returns ok:false when obEval returns empty string (Obsidian unreachable)', async () => {
    mockObEval.mockImplementation(async () => '');
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Obsidian not reachable');
  });
});
