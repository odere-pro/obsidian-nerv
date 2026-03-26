#!/usr/bin/env bun
// STORY-031 — Bun CLI foundation: entry point and subcommand dispatcher
// STORY-038 — Use JSON import for version so compiled binary embeds it correctly

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
// Helpers
// ---------------------------------------------------------------------------

function packageVersion(): string {
  return (pkg as { version?: string }).version ?? '0.0.0';
}

function printUsage(commands: string[]): void {
  const list = commands.length > 0 ? `\nAvailable commands:\n  ${commands.join('\n  ')}` : '';
  process.stdout.write(`Usage: nerv <command> [options]${list}\n`);
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

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printUsage([]);
    if (!subcommand) process.exit(1);
    return;
  }

  // Dynamically import the command module so each command is code-split
  let mod: { default: Command };
  try {
    mod = (await import(`./commands/${subcommand}.ts`)) as { default: Command };
  } catch {
    process.stderr.write(`nerv: unknown command '${subcommand}'\n`);
    printUsage([]);
    process.exit(1);
  }

  await mod.default.run(argv.slice(1));
}

await main();
