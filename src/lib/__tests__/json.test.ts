import { describe, expect, test } from 'bun:test';
import { encodeForJs, parseJson } from '../json.ts';

describe('encodeForJs', () => {
  test('wraps plain string in double quotes', () => {
    expect(encodeForJs('hello')).toBe('"hello"');
  });

  test('escapes double quotes', () => {
    expect(encodeForJs('say "hi"')).toBe('"say \\"hi\\""');
  });

  test('escapes backslashes', () => {
    expect(encodeForJs('a\\b')).toBe('"a\\\\b"');
  });

  test('escapes newlines so the result is a single-line JS string', () => {
    const result = encodeForJs('line1\nline2');
    expect(result).toBe('"line1\\nline2"');
    expect(result).not.toContain('\n');
  });

  test('handles unicode correctly', () => {
    expect(encodeForJs('café')).toBe('"café"');
  });

  test('handles single quotes without escaping (JSON does not escape single quotes)', () => {
    const result = encodeForJs("it's fine");
    expect(result).toBe('"it\'s fine"');
  });

  test('empty string produces empty JSON string', () => {
    expect(encodeForJs('')).toBe('""');
  });
});

describe('parseJson', () => {
  test('parses a valid object', () => {
    const result = parseJson<{ ok: boolean }>('{"ok":true}');
    expect(result).toEqual({ ok: true });
  });

  test('parses a valid array', () => {
    const result = parseJson<number[]>('[1,2,3]');
    expect(result).toEqual([1, 2, 3]);
  });

  test('returns null for malformed JSON', () => {
    expect(parseJson('{bad json}')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(parseJson('')).toBeNull();
  });

  test('parses nested JSON correctly', () => {
    const raw = JSON.stringify({ results: [{ title: 'AWS', score: 10 }] });
    const result = parseJson<{ results: { title: string; score: number }[] }>(raw);
    expect(result?.results[0]?.title).toBe('AWS');
  });
});
