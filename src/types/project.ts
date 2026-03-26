// STORY-031 — Bun CLI foundation: project types

export interface ProjectConfig {
  slug: string;
  title: string;
  vaultName: string;
}

export type VaultRef = {
  name: string;
  path: string;
};
