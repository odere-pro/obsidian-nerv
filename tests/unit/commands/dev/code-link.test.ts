// Tests CODEPATH validation, idempotency logic, and VaultOps integration.
// Uses MockVaultOps for stateful vault assertions instead of hand-rolled mocks.

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as provider from '../../../../src/ports/provider';
import { MockVaultOps } from '../../../../src/ports/mock-vault-ops';
import { validateCodePath, codeLink, appendCodeLink } from '../../../../src/commands/dev/code-link';

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
// appendCodeLink pure function tests
// ---------------------------------------------------------------------------

describe('appendCodeLink', () => {
  test('appends code link before next section', () => {
    const content = '---\n---\n## Connections\n\n## References\n';
    const result = appendCodeLink(content, 'src/foo');
    expect(result.appended).toBe(true);
    expect(result.content).toContain('- implements :: `src/foo`');
    expect(result.content).toContain('## References');
  });

  test('appends at end when no next section', () => {
    const content = '---\n---\n## Connections\n';
    const result = appendCodeLink(content, 'src/bar');
    expect(result.appended).toBe(true);
    expect(result.content).toContain('- implements :: `src/bar`');
  });

  test('returns appended:false when code path already present', () => {
    const content = '---\n---\n## Connections\n- implements :: `src/foo`\n\n## References\n';
    const result = appendCodeLink(content, 'src/foo');
    expect(result.appended).toBe(false);
    expect(result.content).toBe(content);
  });

  test('returns appended:false when no ## Connections marker', () => {
    const content = '---\n---\nNo connections section\n';
    const result = appendCodeLink(content, 'src/foo');
    expect(result.appended).toBe(false);
    expect(result.content).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// codeLink tests (with MockVaultOps)
// ---------------------------------------------------------------------------

describe('codeLink', () => {
  let mockOps: MockVaultOps;

  beforeEach(() => {
    mockOps = new MockVaultOps();
    spyOn(provider, 'getVaultOps').mockReturnValue(mockOps);
  });

  afterEach(() => {
    mock.restore();
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

  test('returns appended:true when code link is new', async () => {
    mockOps.seedFile('v', 'projects/p/note.md', '---\n---\n## Connections\n\n## References\n', {});
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(true);
    const file = await mockOps.readFile('v', 'projects/p/note.md');
    expect(file.content).toContain('- implements :: `src/foo`');
  });

  test('returns appended:false when code path already present (idempotent)', async () => {
    mockOps.seedFile(
      'v',
      'projects/p/note.md',
      '---\n---\n## Connections\n- implements :: `src/foo`\n\n## References\n',
      {}
    );
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(true);
    expect(result.data.appended).toBe(false);
  });

  test('returns ok:false when readFile throws (note not found)', async () => {
    // Don't seed the file — MockVaultOps throws "file not found"
    const result = await codeLink('v', 'projects/p/note.md', 'src/foo');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('note not found');
  });
});
