import type { Command } from '../cli';
import { readRegistry } from '../lib/vault-registry';

const command: Command = {
  name: 'list-vaults',
  description: 'List all registered vaults',
  async run(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write('Usage: nerv list-vaults [--json]\n');
      return;
    }

    const json = args.includes('--json');
    const registry = await readRegistry();

    if (json) {
      const out = registry.vaults.map(v => ({
        name: v.name,
        path: v.path,
        isDefault: v.isDefault === true,
      }));
      process.stdout.write(JSON.stringify(out) + '\n');
      return;
    }

    if (registry.vaults.length === 0) {
      process.stdout.write(
        'No vaults registered. Run: nerv add-vault --vault <name> --path <path>\n'
      );
      return;
    }

    const maxName = Math.max(...registry.vaults.map(v => v.name.length), 'NAME'.length);
    const maxPath = Math.max(...registry.vaults.map(v => v.path.length), 'PATH'.length);

    const header = `${'NAME'.padEnd(maxName)}  ${'PATH'.padEnd(maxPath)}  DEFAULT\n`;
    process.stdout.write(header);

    for (const v of registry.vaults) {
      const def = v.isDefault ? 'yes' : '';
      process.stdout.write(`${v.name.padEnd(maxName)}  ${v.path.padEnd(maxPath)}  ${def}\n`);
    }
  },
};

export default command;
