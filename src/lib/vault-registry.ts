import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { logError } from './logger';
import { spawnCapture } from './shell';

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

export interface VaultEntry {
  path: string;
  isDefault?: boolean;
}

/** Derives the vault name from the last segment of its path. */
export function vaultName(entry: Pick<VaultEntry, 'path'>): string {
  return basename(entry.path);
}

export interface VaultRegistry {
  vaults: VaultEntry[];
}

/* ---------------------------------------------------------------------------
 * Git root + registry path
 * --------------------------------------------------------------------------- */

export async function findGitRoot(): Promise<string> {
  const { stdout, exitCode } = await spawnCapture(['git', 'rev-parse', '--show-toplevel']);
  if (exitCode !== 0) {
    logError('vault-registry: not inside a git repository');
  }
  return stdout.trim();
}

export async function registryPath(): Promise<string> {
  const gitRoot = await findGitRoot();
  return resolve(gitRoot, '.nerv', 'vaults.json');
}

/* ---------------------------------------------------------------------------
 * CRUD
 * --------------------------------------------------------------------------- */

export async function readRegistry(): Promise<VaultRegistry> {
  const path = await registryPath();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { vaults: [] };
    }
    throw err;
  }
  try {
    return JSON.parse(raw) as VaultRegistry;
  } catch {
    logError(`vault-registry: malformed JSON in ${path}`);
  }
}

export async function writeRegistry(r: VaultRegistry): Promise<void> {
  const path = await registryPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(r, null, 2) + '\n', 'utf8');
}

export async function registerVault(vaultPath: string): Promise<void> {
  const resolvedPath = resolve(vaultPath);

  /* Git-root boundary check (can be skipped in test environments) */
  if (process.env['NERV_SKIP_GIT_ROOT_CHECK'] !== '1') {
    const gitRoot = await findGitRoot();
    const inside = resolvedPath === gitRoot || resolvedPath.startsWith(gitRoot + sep);
    if (!inside) {
      logError(`add-vault: path must be inside the git repository. Got: ${vaultPath}`);
    }
  }

  const registry = await readRegistry();
  const name = basename(resolvedPath);

  const existing = registry.vaults.find(v => basename(v.path) === name);
  if (existing) {
    if (existing.path === resolvedPath) {
      /* Idempotent — already registered at the same path */
      return;
    }
    logError(
      `add-vault: vault "${name}" is already registered at a different path: ${existing.path}`
    );
  }

  const isFirstVault = registry.vaults.length === 0;
  registry.vaults.push({
    path: resolvedPath,
    ...(isFirstVault ? { isDefault: true } : {}),
  });

  await writeRegistry(registry);
}

export async function unregisterVault(name: string): Promise<void> {
  const registry = await readRegistry();
  const idx = registry.vaults.findIndex(v => basename(v.path) === name);
  if (idx === -1) {
    logError(`remove-vault: vault "${name}" is not registered`);
  }
  registry.vaults.splice(idx, 1);
  await writeRegistry(registry);
}

export async function lookupVault(name: string): Promise<VaultEntry> {
  const registry = await readRegistry();
  const entry = registry.vaults.find(v => basename(v.path) === name);
  if (!entry) {
    logError(`No vault named "${name}" is registered. Run: nerv list-vaults`);
  }
  return entry;
}

export async function getDefaultVault(): Promise<VaultEntry | undefined> {
  const registry = await readRegistry();
  return registry.vaults.find(v => v.isDefault === true);
}

export async function setDefaultVault(name: string): Promise<void> {
  const registry = await readRegistry();
  const entry = registry.vaults.find(v => basename(v.path) === name);
  if (!entry) {
    logError(`No vault named "${name}" is registered. Run: nerv list-vaults`);
  }
  for (const v of registry.vaults) {
    delete v.isDefault;
  }
  entry.isDefault = true;
  await writeRegistry(registry);
}

/* ---------------------------------------------------------------------------
 * Shared flag parser
 * --------------------------------------------------------------------------- */

export function extractVaultFlag(args: string[]): { vault: string | undefined; rest: string[] } {
  const idx = args.indexOf('--vault');
  if (idx === -1) {
    return { vault: undefined, rest: args };
  }
  const value = args[idx + 1];
  if (value === undefined || value.startsWith('--')) {
    logError('--vault flag requires a value');
  }
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { vault: value, rest };
}
