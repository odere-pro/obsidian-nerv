import type { Command } from '../types/command';
import { extractVaultFlag, lookupVault, setDefaultVault } from '../lib/vault-registry';
import { ValidationError } from '../types/errors';

const HELP =
  'Usage: nerv switch-vault --vault <name>\n  Sets <name> as the default vault for all commands.\n  <name> must already be registered. Run: nerv list-vaults\n';

const command: Command = {
  name: 'switch-vault',
  description: 'Set the default vault for all commands',
  async run(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write(HELP);
      return;
    }

    const { vault: name } = extractVaultFlag(args);

    if (!name) {
      throw new ValidationError('switch-vault: --vault <name> is required', 'vault');
    }

    await setDefaultVault(name);

    const entry = await lookupVault(name);
    process.stdout.write(`==> Default vault set to '${name}'\n    Path: ${entry.path}\n`);
  },
};

export default command;
