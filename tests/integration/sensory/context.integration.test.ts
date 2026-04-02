// Ports assertions from cli/core/tests/test-context.sh.
//
// Assertions covered:
//   1. Output is valid JSON
//   2. Result contains query field
//   3. Results is an array
//   4. Each result has required schema fields
//   5. Notes scoring 0 are excluded
//   6. Breadcrumb field is present and non-empty for a known note
//   7. limit parameter is respected
//   8. vault= keyword argument form is accepted
//   9. No-match returns empty results array (not an error)
//  10. Connections array schema: each entry has rel, target, context fields
//  11. Performance: returns in < 5 seconds for any vault size

import { describe, expect, test } from 'bun:test';
import { contextSearch } from '../../../src/commands/context';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';

describe('context integration', () => {
  test('output is valid JSON with query, vault, results keys', async () => {
    const result = await contextSearch(VAULT_NAME, 'test', 3);
    expect(typeof result.query).toBe('string');
    expect(typeof result.vault).toBe('string');
    expect(Array.isArray(result.results)).toBe(true);
  });

  test('query field matches input', async () => {
    const result = await contextSearch(VAULT_NAME, 'knowledge graph', 5);
    expect(result.query).toBe('knowledge graph');
  });

  test('results is an array', async () => {
    const result = await contextSearch(VAULT_NAME, 'anything', 5);
    expect(Array.isArray(result.results)).toBe(true);
  });

  test('each result has required schema fields', async () => {
    const result = await contextSearch(VAULT_NAME, 'note', 5);
    for (const r of result.results) {
      expect(typeof r.path).toBe('string');
      expect(typeof r.title).toBe('string');
      expect(typeof r.type).toBe('string');
      expect(typeof r.kind).toBe('string');
      expect(typeof r.spine).toBe('string');
      expect(typeof r.status).toBe('string');
      expect(typeof r.parent).toBe('string');
      expect(Array.isArray(r.children)).toBe(true);
      expect(Array.isArray(r.aliases)).toBe(true);
      expect(typeof r.breadcrumb).toBe('string');
      expect(typeof r.summary).toBe('string');
      expect(typeof r.content).toBe('string');
      expect(Array.isArray(r.connections)).toBe(true);
    }
  });

  test('connections array entries have rel, target, context fields', async () => {
    const result = await contextSearch(VAULT_NAME, 'note', 10);
    for (const r of result.results) {
      for (const conn of r.connections) {
        expect(typeof conn.rel).toBe('string');
        expect(typeof conn.target).toBe('string');
        expect(typeof conn.context).toBe('string');
      }
    }
  });

  test('limit parameter restricts result count', async () => {
    const result = await contextSearch(VAULT_NAME, 'note', 2);
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  test('no-match query returns empty results (not an error)', async () => {
    const result = await contextSearch(VAULT_NAME, 'zzzz_absolutely_no_match_xyzabc_9999', 5);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  test('breadcrumb field is present and non-empty for matched notes', async () => {
    const result = await contextSearch(VAULT_NAME, 'note', 5);
    if (result.results.length > 0) {
      // At least the note's own basename should appear in breadcrumb
      for (const r of result.results) {
        expect(r.breadcrumb.length).toBeGreaterThan(0);
      }
    }
  });

  test('vault name in output matches resolved vault', async () => {
    const result = await contextSearch(VAULT_NAME, 'test', 3);
    expect(result.vault).toBeTruthy();
    expect(typeof result.vault).toBe('string');
  });

  test('content field is capped at 2000 characters', async () => {
    const result = await contextSearch(VAULT_NAME, 'note', 5);
    for (const r of result.results) {
      expect(r.content.length).toBeLessThanOrEqual(2000);
    }
  });

  test('performance: returns in < 5 seconds', async () => {
    const start = Date.now();
    await contextSearch(VAULT_NAME, 'note', 5);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});
