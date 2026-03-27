// Port interface for vault I/O operations.
// Commands depend on this contract — never on a concrete backend.

export interface VaultFile {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface VaultFileEntry {
  path: string;
  frontmatter: Record<string, unknown>;
}

export interface VaultOps {
  fileExists(vault: string, path: string): Promise<boolean>;
  readFile(vault: string, path: string): Promise<VaultFile>;
  createFile(vault: string, path: string, content: string): Promise<void>;
  updateFrontmatter(vault: string, path: string, mutations: Record<string, unknown>): Promise<void>;
  listFiles(vault: string): Promise<VaultFileEntry[]>;
  appendToDaily(vault: string, content: string): Promise<void>;
  openDaily(vault: string): Promise<void>;
  listRecentFiles(vault: string, limit: number, sort?: string): Promise<string[]>;
  listUnresolved(vault: string): Promise<string[]>;
  trashFile(vault: string, path: string): Promise<void>;
  appendToFile(vault: string, path: string, content: string): Promise<void>;
  replaceFileContent(vault: string, path: string, content: string): Promise<void>;
}
