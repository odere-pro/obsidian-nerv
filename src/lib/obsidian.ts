//
// TypeScript port of cli/core/lib.sh — resolveVault, ob_eval, daily_append,
// and rollback_log functions.

import { access } from 'node:fs/promises';
import { encodeForJs } from './json';
import { logError } from './logger';
import { spawnCapture } from './shell';
import { type VaultEntry, getDefaultVault, lookupVault } from './vault-registry';

/**
 * Resolve the target vault name.
 *
 * Resolution order:
 *   1. Explicit `vault` arg → lookupVault(arg)
 *   2. `NERV_DEFAULT_VAULT` env variable → lookupVault(env)
 *   3. Registry default → getDefaultVault()
 *   4. Hard error
 *
 * Every resolved entry is validated for on-disk existence.
 *
 * @param vault - Optional: a vault name (typically extracted via --vault flag), or undefined.
 * @returns The resolved vault name.
 * @throws via logError if no vault can be determined.
 */
export async function resolveVault(vault?: string): Promise<string> {
  let entry: VaultEntry | undefined;

  // Priority 1 — explicit arg
  if (vault !== undefined && vault !== '') {
    entry = await lookupVault(vault);
  }

  // Priority 2 — env variable
  if (!entry) {
    const envVault = Bun.env['NERV_DEFAULT_VAULT'];
    if (envVault) {
      entry = await lookupVault(envVault);
    }
  }

  // Priority 3 — registry default
  if (!entry) {
    entry = await getDefaultVault();
  }

  // Priority 4 — error
  if (!entry) {
    logError(
      'No vault specified. Pass --vault <name>, set NERV_DEFAULT_VAULT, or run: nerv switch-vault <name>'
    );
  }

  // Disk-existence validation
  let pathExists = true;
  try {
    await access(entry.path);
  } catch {
    pathExists = false;
  }
  if (!pathExists) {
    logError(
      `Vault "${entry.name}" is registered but its path does not exist: ${entry.path}. Run: nerv add-vault --vault ${entry.name} --path ${entry.path}`
    );
  }

  return entry.name;
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

  // FIXME: Find better solution for eval expression construction. This is very brittle and error-prone, especially with the need to embed both header and entry, and the requirement for the entire expression to be a single line.
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
