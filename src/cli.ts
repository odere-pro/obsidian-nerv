#!/usr/bin/env bun
// Bun CLI foundation: entry point and subcommand dispatcher
// Use JSON import for version so compiled binary embeds it correctly

import pkg from '../package.json';

// ---------------------------------------------------------------------------
// Command interface — every command module must export a default satisfying this
// ---------------------------------------------------------------------------
export interface Command {
  name: string;
  description: string;
  run(args: string[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Static command registry — keep in sync with src/commands/
// ---------------------------------------------------------------------------
const COMMANDS: Array<{ name: string; description: string }> = [
  { name: 'init-vault', description: 'Provision a new Obsidian vault (idempotent)' },
  { name: 'create-entity', description: 'Create a new entity note' },
  { name: 'create-project', description: 'Create a new project' },
  { name: 'get-entity', description: 'Look up an entity by name' },
  { name: 'get-tree', description: 'Print the knowledge tree' },
  { name: 'get-knowledge-gap', description: 'Identify knowledge gaps' },
  { name: 'add-connection', description: 'Add a relationship between two entities' },
  { name: 'sync-ontology', description: 'Sync the vault ontology file' },
  { name: 'sync-vocab', description: 'Sync the vault vocabulary file' },
  { name: 'sync-topk', description: 'Sync the vault top-K file' },
  { name: 'explain-topic', description: 'Explain a topic using vault context' },
  { name: 'import-json', description: 'Import entities from a JSON file' },
  { name: 'migrate', description: 'Run vault migrations' },
  { name: 'morning', description: 'Morning review routine' },
  { name: 'weekly-review', description: 'Weekly review routine' },
  { name: 'cli-lint', description: 'Lint vault notes' },
  { name: 'cli-orphans', description: 'Find orphaned notes' },
  { name: 'cli-relations', description: 'Inspect entity relations' },
  { name: 'context', description: 'Print vault context for AI prompts' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function packageVersion(): string {
  return (pkg as { version?: string }).version ?? '0.0.0';
}

function printHelp(): void {
  const maxLen = Math.max(...COMMANDS.map(c => c.name.length));
  const lines = COMMANDS.map(c => `  ${c.name.padEnd(maxLen)}  ${c.description}`);
  process.stdout.write(
    `nerv v${packageVersion()}\n\nUsage: nerv <command> [options]\n\nCommands:\n${lines.join('\n')}\n\nRun 'nerv <command> --help' for command-specific options.\n`
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const subcommand = argv[0];

  if (subcommand === '--version' || subcommand === '-v') {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }

  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    printHelp();
    if (!subcommand) process.exit(1);
    return;
  }

  // Dynamically import the command module so each command is code-split
  let mod: { default: Command };
  try {
    mod = (await import(`./commands/${subcommand}`)) as { default: Command };
  } catch {
    process.stderr.write(`nerv: unknown command '${subcommand}'\n`);
    printHelp();
    process.exit(1);
  }

  await mod.default.run(argv.slice(1));
}

await main();
