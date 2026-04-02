// Contract tests for ObsidianCliAdapter.
// Run with: bun test tests/integration/adapters/obsidian-cli.contract.test.ts

import { ObsidianCliAdapter } from '../../../src/adapters/obsidian-cli';
import { runVaultOpsContractTests } from '../../unit/ports/vault-ops-contract';

const VAULT_NAME = process.env.NERV_TEST_VAULT ?? 'test';

runVaultOpsContractTests('ObsidianCliAdapter', () => new ObsidianCliAdapter(), {
  vault: VAULT_NAME,
});
