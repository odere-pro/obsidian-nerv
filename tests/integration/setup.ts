//
// Global preload for integration tests.
// Provisions the test vault, registers it, and ensures Obsidian can reach it.
// Bun loads this via --preload in the test:integration script.

import { resolve } from 'node:path';
import { initVault } from '../../src/commands/add-vault';
import { ensureObsidian } from '../../src/lib/obsidian';
import { registerVault } from '../../src/lib/vault-registry';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'e2e-integration-test-vault';
const VAULT_ROOT = process.env.NERV_VAULT_PATH ?? './docs/vaults';
const VAULT_PATH = resolve(VAULT_ROOT, VAULT_NAME);

try {
  await initVault({ name: VAULT_NAME, path: VAULT_PATH });
  await registerVault(VAULT_PATH);
  await ensureObsidian(VAULT_NAME, VAULT_PATH);
} catch (err) {
  console.error(`[setup] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
