import type { Command } from '../cli';
import { logError } from '../lib/logger';
import { extractVaultFlag, lookupVault, unregisterVault } from '../lib/vault-registry';

const HELP =
  'Usage: nerv remove-vault --vault <name> --force\n  Removes <name> from the vault registry. Does NOT delete vault files.\n  --force  Required to confirm the removal.\n';

const command: Command = {
  name: 'remove-vault',
  description: 'Remove a vault from the registry (does not delete files)',
  async run(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write(HELP);
      return;
    }

    const { vault: name } = extractVaultFlag(args);
    const force = args.includes('--force');

    if (!name) {
      logError('remove-vault: --vault <name> is required');
    }

    if (!force) {
      process.stderr.write(
        `remove-vault: --force is required to remove a vault registration.\nRun: nerv remove-vault --vault ${name} --force\n`
      );
      process.exit(1);
    }

    // Read entry before removal to capture path and default status
    const entry = await lookupVault(name);
    const wasDefault = entry.isDefault === true;

    await unregisterVault(name);

    process.stdout.write(
      `==> Removed vault '${name}' from registry.\n    Files at ${entry.path} were NOT deleted.\n`
    );

    if (wasDefault) {
      process.stdout.write(
        `    Warning: no default vault is set. Run: nerv switch-vault --vault <name>\n`
      );
    }
  },
};

export default command;
