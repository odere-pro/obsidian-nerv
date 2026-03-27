//
// add-vault — CLI command that wraps init-vault with registry integration.
//
// Re-exports all named exports from init-vault so existing imports keep working.
// Adds: --vault flag, git-root boundary guard, vault registry write.

import { resolve, sep } from 'node:path';
import type { Command } from '../cli';
import { extractVaultFlag, findGitRoot, registerVault } from '../lib/vault-registry';
import { deployAgentFiles, ensureZprofilePath, initVault } from './init-vault';

// Re-export everything from init-vault for consumers that import from add-vault
export {
  buildVaultFileMap,
  deployAgentFiles,
  ensureZprofilePath,
  gitInit,
  initVault,
  VAULT_DIRS,
} from './init-vault';
export type { InitVaultParams, InitVaultResult } from './init-vault';

// ---------------------------------------------------------------------------
// CLI adapter
// ---------------------------------------------------------------------------

const HELP =
  'Usage: nerv add-vault --vault <name> [--path <path>]\n  --vault  Vault name (required)\n  --path   Vault root directory (default: ./docs/vaults)\n';

const command: Command = {
  name: 'add-vault',
  description: 'Provision and register a new vault (idempotent)',
  async run(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write(HELP);
      return;
    }

    const { vault: name, rest } = extractVaultFlag(args);
    const pathIdx = rest.indexOf('--path');
    const rawPath = pathIdx !== -1 ? rest[pathIdx + 1] : './docs/vaults';

    if (!name) {
      process.stderr.write(`add-vault: --vault <name> is required\n${HELP}`);
      process.exit(1);
    }

    const vaultPath = resolve(rawPath.replace(/^~/, Bun.env.HOME ?? ''));

    // Git-root boundary guard
    if (process.env['NERV_SKIP_GIT_ROOT_CHECK'] !== '1') {
      const gitRoot = await findGitRoot();
      const inside = vaultPath === gitRoot || vaultPath.startsWith(gitRoot + sep);
      if (!inside) {
        process.stderr.write(
          `add-vault: vault path must be inside the git repository.\n  Git root: ${gitRoot}\n  Given:    ${vaultPath}\n`
        );
        process.exit(1);
      }
    }

    await initVault({ name, path: vaultPath });
    await deployAgentFiles(name, vaultPath);
    await ensureZprofilePath();

    await registerVault(name, vaultPath);
    process.stdout.write(`==> Registered vault '${name}' in .nerv/vaults.json\n`);
  },
};

export default command;
