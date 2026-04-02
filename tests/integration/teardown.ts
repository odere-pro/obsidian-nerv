//
// Global teardown for integration tests.
// Closes Obsidian and deletes the test vault from disk and the nerv registry.
// Skipped when NERV_SKIP_CLEANUP=1.
// Bun loads this via --env-file .env.integration in the test:integration script.

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unregisterVault } from '../../src/lib/vault-registry';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'e2e-integration-test-vault';
const VAULT_ROOT = process.env.NERV_VAULT_PATH ?? './docs/vaults';
const VAULT_PATH = resolve(VAULT_ROOT, VAULT_NAME);

if (process.env.NERV_SKIP_CLEANUP === '1') {
  process.stderr.write('[teardown] NERV_SKIP_CLEANUP=1 — keeping vault and Obsidian open.\n');
  process.exit(0);
}

await Bun.$`osascript -e 'tell application "Obsidian" to quit'`.quiet().nothrow();

// Wait for Obsidian to fully terminate before touching the vault or obsidian.json.
// osascript returns as soon as the quit signal is sent, not when the app exits.
const quitDeadline = Date.now() + 15_000;
while (Date.now() < quitDeadline) {
  const { exitCode } = await Bun.$`pgrep -x Obsidian`.quiet().nothrow();
  if (exitCode !== 0) break;
  await Bun.sleep(500);
}

await rm(VAULT_PATH, { recursive: true, force: true });
await unregisterVault(VAULT_NAME).catch(() => {});

process.stderr.write(`[teardown] Removed vault '${VAULT_NAME}' and closed Obsidian.\n`);
