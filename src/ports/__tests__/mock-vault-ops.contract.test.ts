// Contract tests for MockVaultOps — validates the mock itself satisfies the VaultOps contract.

import { MockVaultOps } from '../mock-vault-ops';
import { runVaultOpsContractTests } from './vault-ops-contract';

runVaultOpsContractTests('MockVaultOps', () => new MockVaultOps());
