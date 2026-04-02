// Contract tests for MockVaultOps — validates the mock itself satisfies the VaultOps contract.

import { MockVaultOps } from '../../../src/ports/mock-vault-ops';
import { runVaultOpsContractTests } from './vault-ops-contract';

runVaultOpsContractTests('MockVaultOps', () => new MockVaultOps());
