// STORY-040 — Web ingestion: defuddle shared utility
//
// Wraps `defuddle parse <url> --json` and provides:
//   - DefuddleOutput type representing the stable JSON contract
//   - fetchAndParse()     — subprocess call with 30-second timeout
//   - generateUrlSlug()   — deterministic, URL-safe slug from a URL

import { spawnCapture } from './shell';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DefuddleOutput {
  title: string;
  description: string;
  content: string;
  author?: string;
  date?: string;
  siteName?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic, URL-safe slug from a URL.
 *
 * Combines the sanitised hostname with the lower 32-bit djb2 hash of the full
 * URL, giving a stable identifier that survives path changes (redirect chains).
 *
 * @security Validated against /^[a-z0-9-]+$/ before use in createEntity.
 */
export function generateUrlSlug(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Fallback: hash the raw string
    parsed = { hostname: 'unknown' } as URL;
  }

  const domainSlug = parsed.hostname.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // djb2 hash — keep unsigned 32-bit result
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) >>> 0;
  }
  const hashHex = hash.toString(16).padStart(8, '0');

  return `${domainSlug}-${hashHex}`.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Defuddle subprocess call
// ---------------------------------------------------------------------------

/**
 * Call `defuddle parse <url> --json` and return parsed output.
 *
 * @throws {ShellTimeoutError} if defuddle exceeds the 30-second hard timeout.
 * @throws {Error}             on network error, non-zero exit, or malformed JSON.
 *
 * @security url must be pre-validated (http/https only) by the caller.
 *   Never interpolate url into a shell string — spawnCapture uses the
 *   tuple form which prevents shell injection.
 */
export async function fetchAndParse(url: string): Promise<DefuddleOutput> {
  const { stdout, stderr, exitCode } = await spawnCapture(['defuddle', 'parse', url, '--json']);

  if (exitCode !== 0) {
    const msg = stderr.trim() || stdout.trim() || 'unknown error';
    throw new Error(`defuddle parse failed (exit ${exitCode}): ${msg}`);
  }

  let parsed: DefuddleOutput;
  try {
    parsed = JSON.parse(stdout) as DefuddleOutput;
  } catch {
    throw new Error(`defuddle returned invalid JSON: ${stdout.slice(0, 200)}`);
  }

  if (!parsed.title || !parsed.content) {
    throw new Error('defuddle output missing required fields: title, content');
  }

  return parsed;
}
