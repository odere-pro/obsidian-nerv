/**
 * Replaces the `python3 -c "import json,sys; print(json.dumps(sys.argv[1]))"` pattern
 * used throughout the Bash scripts for safely embedding shell variables in JS expressions.
 */

/**
 * JSON-encode a string value for safe embedding in an `obsidian eval` expression.
 * Produces a quoted JSON string (e.g. `"hello \"world\""`) that can be pasted
 * directly into a JS template literal.
 *
 * Use this for every user-supplied or runtime string that is interpolated into
 * an eval expression — prevents JS injection via quotes, backslashes, or newlines.
 */
export function encodeForJs(value: string): string {
  return JSON.stringify(value);
}

/**
 * Parse a JSON string. Returns the parsed value on success, or `null` on
 * any parse error. Never throws.
 */
export function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Parse a JSON string, preserving the error message on failure.
 * Use this when the caller needs to report *why* parsing failed.
 */
export function parseJsonVerbose<T>(raw: string): { data: T } | { error: string } {
  try {
    return { data: JSON.parse(raw) as T };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
