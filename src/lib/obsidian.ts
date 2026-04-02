/**
 * TypeScript port of cli/core/lib.sh — resolveVault, ob_eval, daily_append,
 * and rollback_log functions.
 */

import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encodeForJs } from './json';
import { logError } from './logger';
import { spawnCapture } from './shell';
import { type VaultEntry, getDefaultVault, lookupVault, vaultName } from './vault-registry';

/** Max safe inline expression length for Obsidian CLI's IPC mechanism. */
const MAX_INLINE_EXPR = 4000;

/** How often to poll when waiting for Obsidian to become reachable. */
const POLL_INTERVAL_MS = 2_000;

/** Maximum time to wait for Obsidian to start and open a vault. */
const POLL_TIMEOUT_MS = 30_000;

/**
 * Probe whether the Obsidian CLI can reach a vault.
 *
 * Runs a trivial eval expression; returns true if the CLI responds with the
 * expected result within the shell timeout.
 */
async function isVaultReachable(vault: string): Promise<boolean> {
  const { exitCode, stdout } = await spawnCapture([
    'obsidian',
    `vault=${vault}`,
    'eval',
    "code='ok'",
  ]);
  return exitCode === 0 && stdout.includes('ok');
}

/**
 * Path to Obsidian's internal vault registry on macOS.
 *
 * Obsidian tracks known vaults in this JSON file. A vault must appear here
 * before `obsidian://open?path=` can locate it.
 */
const OBSIDIAN_CONFIG_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'obsidian',
  'obsidian.json'
);

/**
 * Ensure the vault is listed in Obsidian's internal vault registry.
 *
 * Obsidian's `obsidian://open?path=` URI only works for vaults already known
 * to the app. This function reads the config, checks whether the vault path
 * is already registered, and adds it if not.
 *
 * @param vaultPath - Absolute path to the vault root on disk.
 * @returns true if the vault was newly registered, false if already present.
 */
async function registerVaultInObsidian(vaultPath: string): Promise<boolean> {
  const absPath = resolve(vaultPath);

  let config: { vaults: Record<string, { path: string; ts: number }>; [k: string]: unknown };
  try {
    const raw = await readFile(OBSIDIAN_CONFIG_PATH, 'utf8');
    config = JSON.parse(raw);
  } catch {
    /* Config missing or unreadable — nothing we can do */
    return false;
  }

  if (!config.vaults) config.vaults = {};

  /* Check if already registered */
  const alreadyRegistered = Object.values(config.vaults).some(v => resolve(v.path) === absPath);
  if (alreadyRegistered) return false;

  const id = randomBytes(8).toString('hex');
  config.vaults[id] = { path: absPath, ts: Date.now() };
  await writeFile(OBSIDIAN_CONFIG_PATH, JSON.stringify(config));
  return true;
}

/**
 * Ensure Obsidian is running and the given vault is open.
 *
 * Registers the vault in Obsidian's internal config if needed, then opens it
 * by passing the vault folder directly to the Obsidian app. Using `open -a
 * Obsidian <path>` is more reliable than the `obsidian://open?path=` URI
 * scheme for cold-start scenarios where Obsidian is not already running —
 * the URI scheme requires the vault to be in Obsidian's in-memory registry,
 * whereas the direct path open works regardless of prior state. Polls until
 * the CLI can reach the vault or the timeout expires.
 *
 * @param vault     - Vault name (must already be resolved / registered in nerv).
 * @param vaultPath - Absolute path to the vault root on disk.
 * @throws via logError if the vault cannot be reached within the timeout.
 */
export async function ensureObsidian(vault: string, vaultPath: string): Promise<void> {
  if (await isVaultReachable(vault)) return;

  await registerVaultInObsidian(vaultPath);

  process.stderr.write(`INFO: Opening vault '${vault}' in Obsidian…\n`);
  await Bun.$`open -a Obsidian ${resolve(vaultPath)}`.quiet().nothrow();

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    if (await isVaultReachable(vault)) return;
  }

  logError(
    `Timed out waiting for vault '${vault}' to become accessible via Obsidian CLI.\n` +
      `  Ensure Obsidian is installed and can open: ${vaultPath}`
  );
}

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

  /* Priority 1 — explicit arg */
  if (vault !== undefined && vault !== '') {
    entry = await lookupVault(vault);
  }

  /* Priority 2 — env variable */
  if (!entry) {
    const envVault = Bun.env['NERV_DEFAULT_VAULT'];
    if (envVault) {
      entry = await lookupVault(envVault);
    }
  }

  /* Priority 3 — registry default */
  if (!entry) {
    entry = await getDefaultVault();
  }

  /* Priority 4 — error */
  if (!entry) {
    logError(
      'No vault specified. Pass --vault <name>, set NERV_DEFAULT_VAULT, or run: nerv switch-vault <name>'
    );
  }

  /* Disk-existence validation */
  let pathExists = true;
  try {
    await access(entry.path);
  } catch {
    pathExists = false;
  }
  if (!pathExists) {
    logError(
      `Vault "${vaultName(entry)}" is registered but its path does not exist: ${entry.path}. Run: nerv add-vault --vault ${vaultName(entry)} --path ${entry.path}`
    );
  }

  return vaultName(entry);
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

  /*
   * Large expressions exceed the Obsidian CLI's IPC argument limit and cause
   * hangs. Write them to a temp file and bootstrap with a short wrapper that
   * reads the file content via Node's fs module (available in Electron).
   */
  let tmpFile: string | undefined;
  let codeArg = expr;
  if (expr.length > MAX_INLINE_EXPR) {
    tmpFile = join(tmpdir(), `obeval-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
    await Bun.write(tmpFile, expr);
    /*
     * Security note: intentional — obEval's entire purpose is to evaluate trusted
     * JS expressions inside Obsidian. The temp file contains the same expression
     * that would otherwise be inlined in the code= arg.
     */
    const readExpr = `require('fs').readFileSync(${JSON.stringify(tmpFile)},'utf8')`;
    codeArg = `(0,eval)(${readExpr})`; /* indirect eval in global scope */
  }

  let result: { stdout: string; exitCode: number; stderr: string };
  try {
    result = await spawnCapture(['obsidian', `vault=${vault}`, 'eval', `code=${codeArg}`]);
  } finally {
    if (tmpFile) await unlink(tmpFile).catch(() => {});
  }

  const { stdout, exitCode, stderr } = result;

  if (exitCode !== 0) {
    logError(`obEval failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`);
  }

  /*
   * The CLI prefixes result lines with "=> "; strip informational/warning lines
   * preceding the result (e.g. "Loading updated app package..." upgrade notices).
   */
  const noiseRe =
    /^(\d{4}-\d{2}-\d{2} |Loading updated|Your Obsidian installer|Ignored:|Checking for update|Success\.|Latest version|App is up to date|\(no output\)|$)/;
  const lines = stdout.split('\n');
  const firstResult = lines.findIndex(l => l.startsWith('=> '));
  if (firstResult === -1) {
    /* No "=> " prefix — check if this is a void return or an error */
    const meaningful = lines
      .filter(l => !noiseRe.test(l))
      .join('\n')
      .trim();
    if (meaningful) {
      throw new Error(`obEval: ${meaningful}`);
    }
    /* Void return — expression succeeded but produced no output */
    return '';
  }
  return lines
    .slice(firstResult)
    .map(l => (l.startsWith('=> ') ? l.slice('=> '.length) : l))
    .join('\n')
    .trim();
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
    `vault=${vault}`,
    'daily:append',
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

  /* FIXME: Eval expression construction is brittle — embedding both header and entry
   * with the entire expression as a single line is fragile and error-prone. */
  const expr = `(async () => {
  const path = '_inbox/_rollback-log.md';
  const dir = '_inbox';
  if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
  const f = app.vault.getAbstractFileByPath(path);
  if (f) {
    await app.vault.append(f, ${jsEntry});
  } else {
    await app.vault.create(path, ${jsHeader} + ${jsEntry});
  }
  return 'ok';
})()`;

  await obEval(vault, expr);
}
