import type { Command } from '../cli';
import { extractVaultFlag, getDefaultVault, readRegistry } from '../lib/vault-registry';

type Source = 'env' | 'default' | 'none';

interface Resolution {
  name: string | null;
  path: string | null;
  source: Source;
}

async function resolve(explicitVault?: string): Promise<Resolution> {
  // --vault override: look up specific vault, never throw
  if (explicitVault !== undefined) {
    const registry = await readRegistry();
    const entry = registry.vaults.find(v => v.name === explicitVault);
    if (!entry) return { name: null, path: null, source: 'none' };
    return { name: entry.name, path: entry.path, source: 'default' };
  }

  // NERV_DEFAULT_VAULT env
  const envVault = Bun.env.NERV_DEFAULT_VAULT;
  if (envVault) {
    const registry = await readRegistry();
    const entry = registry.vaults.find(v => v.name === envVault);
    if (entry) return { name: entry.name, path: entry.path, source: 'env' };
  }

  // Registry default
  const defaultEntry = await getDefaultVault();
  if (defaultEntry) {
    return { name: defaultEntry.name, path: defaultEntry.path, source: 'default' };
  }

  return { name: null, path: null, source: 'none' };
}

const NO_VAULT_HELP = `Current vault: (none)
  Source: none

To configure a vault:
  nerv add-vault --vault <name> --path <path>   — provision and register a new vault
  nerv switch-vault --vault <name>              — set an existing vault as default
  export NERV_DEFAULT_VAULT=<name>              — override via environment variable
`;

const command: Command = {
  name: 'current-vault',
  description: 'Show which vault would be resolved for the next command',
  async run(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write('Usage: nerv current-vault [--vault <name>] [--json]\n');
      return;
    }

    const json = args.includes('--json');
    const { vault: explicitVault } = extractVaultFlag(args);

    // --vault specified but not registered
    if (explicitVault !== undefined) {
      const registry = await readRegistry();
      const entry = registry.vaults.find(v => v.name === explicitVault);
      if (!entry) {
        process.stdout.write(`Vault "${explicitVault}" is not registered. Run: nerv list-vaults\n`);
        return;
      }
      if (json) {
        process.stdout.write(
          JSON.stringify({ vault: entry.name, path: entry.path, source: 'default' }) + '\n'
        );
        return;
      }
      process.stdout.write(
        `Current vault: ${entry.name}\n  Path:   ${entry.path}\n  Source: default  (--vault flag)\n`
      );
      return;
    }

    const res = await resolve();

    if (json) {
      process.stdout.write(
        JSON.stringify({ vault: res.name, path: res.path, source: res.source }) + '\n'
      );
      return;
    }

    if (res.name === null) {
      process.stdout.write(NO_VAULT_HELP);
      return;
    }

    const sourceLabel =
      res.source === 'env' ? 'env  (NERV_DEFAULT_VAULT)' : 'default  (registry default)';

    process.stdout.write(
      `Current vault: ${res.name}\n  Path:   ${res.path}\n  Source: ${sourceLabel}\n`
    );
  },
};

export default command;
