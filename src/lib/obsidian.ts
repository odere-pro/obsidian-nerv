//
// TypeScript port of cli/core/lib.sh — resolveVault, ob_eval, daily_append,
// and rollback_log functions.

import { encodeForJs } from './json';
import { logError } from './logger';
import { spawnCapture } from './shell';

/**
 * Resolve the target vault name.
 *
 * Accepts either a positional string or a `vault=<name>` prefix form.
 * Falls back to the currently active vault via `obsidian vault`.
 *
 * @param arg - Optional: a bare vault name, a `vault=<name>` string, or undefined.
 * @returns The resolved vault name.
 * @throws via logError if no vault can be determined.
 */
export async function resolveVault(arg?: string): Promise<string> {
  if (arg !== undefined && arg !== '') {
    if (arg.startsWith('vault=')) {
      return arg.slice('vault='.length);
    }
    return arg;
  }

  // Fall back to the active vault reported by the CLI
  const { stdout, exitCode } = await spawnCapture(['obsidian', 'vault']);
  if (exitCode === 0) {
    for (const line of stdout.split('\n')) {
      const parts = line.split('\t');
      if (parts[0]?.trim() === 'name' && parts[1]?.trim()) {
        return parts[1].trim();
      }
    }
  }

  logError('Could not determine active vault. Pass vault=<name> explicitly.');
}

/**
 * Run a JavaScript expression inside the named Obsidian vault and return the result.
 *
 * @param vault - Vault name (resolved by resolveVault).
 * @param expr  - JS expression to evaluate. Must be pre-sanitised; use encodeForJs()
 *   for any user-supplied or runtime string embedded in the expression.
 * @returns The expression result with the `=> ` prefix stripped.
 *
 * @security Never pass user-supplied, unvalidated input as `expr`.
 *   Always build the expression using encodeForJs() for string values.
 */
export async function obEval(vault: string, expr: string): Promise<string> {
  if (!vault) logError('obEval: vault argument is required');
  if (!expr) logError('obEval: expr argument is required');

  const { stdout, exitCode, stderr } = await spawnCapture([
    'obsidian',
    'eval',
    `vault=${vault}`,
    `code=${expr}`,
  ]);

  if (exitCode !== 0) {
    logError(`obEval failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`);
  }

  // The CLI prefixes every result line with "=> "; strip it for clean output.
  return stdout.replace(/^=> /gm, '').trim();
}

/**
 * Append a line of content to today's daily note. Creates the note if absent.
 *
 * @param vault   - Vault name.
 * @param content - Text to append (single line; newlines are allowed).
 */
export async function dailyAppend(vault: string, content: string): Promise<void> {
  const { exitCode, stderr } = await spawnCapture([
    'obsidian',
    'daily:append',
    `vault=${vault}`,
    `content=${content}`,
  ]);

  if (exitCode !== 0) {
    logError(`dailyAppend failed: ${stderr.trim()}`);
  }
}

/**
 * Append a structured entry to `_inbox/_rollback-log.md`.
 * Creates the file with a header row if it does not yet exist.
 *
 * Entries are Markdown table rows: `| ISO-timestamp | operation | partial_state |`
 *
 * @param vault        - Vault name.
 * @param operation    - Name of the operation that partially failed.
 * @param partialState - Description of state left behind; newlines collapsed to spaces.
 */
export async function rollbackLog(
  vault: string,
  operation: string,
  partialState: string
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const safeState = partialState.replace(/\n/g, ' ');
  const entry = `| ${timestamp} | ${operation} | ${safeState} |`;

  const header =
    '# Rollback Log\n\n' +
    'Entries written by CLI skills on partial failure. Operator triage required.\n\n' +
    '| Timestamp | Operation | Partial State |\n' +
    '|-----------|-----------|---------------|\n';

  const jsEntry = encodeForJs(entry + '\n');
  const jsHeader = encodeForJs(header);

  const expr = `(async () => {
  const path = '_inbox/_rollback-log.md';
  const f = app.vault.getAbstractFileByPath(path);
  if (f) {
    await app.vault.append(f, ${jsEntry});
  } else {
    await app.vault.create(path, ${jsHeader} + ${jsEntry});
  }
})()`;

  await obEval(vault, expr);
}
