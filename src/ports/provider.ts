// Dependency injection provider for port interfaces.
// Commands import getVaultOps() / getDevOps() — never a concrete adapter.

import { ObsidianCliAdapter } from '../adapters/obsidian-cli';
import { ObsidianDevAdapter } from '../adapters/obsidian-dev';
import type { DevOps } from './dev-ops';
import type { VaultOps } from './vault-ops';

let vaultOps: VaultOps = new ObsidianCliAdapter();
let devOps: DevOps = new ObsidianDevAdapter();

export function getVaultOps(): VaultOps {
  return vaultOps;
}

export function setVaultOps(ops: VaultOps): void {
  vaultOps = ops;
}

export function getDevOps(): DevOps {
  return devOps;
}

export function setDevOps(ops: DevOps): void {
  devOps = ops;
}
