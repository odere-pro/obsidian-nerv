// Contract tests for ObsidianCliAdapter — gated on OBSIDIAN_RUNNING=1.
// Run with: OBSIDIAN_RUNNING=1 bun test src/adapters/__tests__/obsidian-cli.contract.test.ts

import { describe, test } from 'bun:test';
import { ObsidianCliAdapter } from '../obsidian-cli';
import { runVaultOpsContractTests } from '../../ports/__tests__/vault-ops-contract';

if (process.env.OBSIDIAN_RUNNING === '1') {
  runVaultOpsContractTests('ObsidianCliAdapter', () => new ObsidianCliAdapter());
} else {
  describe('ObsidianCliAdapter contract (skipped)', () => {
    test('set OBSIDIAN_RUNNING=1 to run', () => {
      // Intentionally empty — gate prevents running without Obsidian.
    });
  });
}
