// Dependency injection provider for port interfaces.
// Commands import getVaultOps() / getDevOps() — never a concrete adapter.

import { ObsidianCliAdapter } from '../adapters/obsidian-cli';
import type { DevOps } from './dev-ops';
import type { VaultOps } from './vault-ops';

let vaultOps: VaultOps = new ObsidianCliAdapter();
let devOps: DevOps | undefined;

export function getVaultOps(): VaultOps {
  return vaultOps;
}

export function setVaultOps(ops: VaultOps): void {
  vaultOps = ops;
}

export function getDevOps(): DevOps {
  if (!devOps) {
    throw new Error('DevOps provider not initialised — STORY-052 not yet implemented');
  }
  return devOps;
}

export function setDevOps(ops: DevOps): void {
  devOps = ops;
}
