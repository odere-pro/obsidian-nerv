/**
 * Port interface for vault I/O operations.
 * Commands depend on this contract — never on a concrete backend.
 */

/** A file read from the vault, including its parsed frontmatter. */
export interface VaultFile {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

/** A lightweight file entry used when listing vault contents. */
export interface VaultFileEntry {
  path: string;
  frontmatter: Record<string, unknown>;
}

/**
 * Port interface for vault I/O operations.
 * Commands import and call this interface only — never a concrete backend.
 * The production implementation is ObsidianCliAdapter; the test double is MockVaultOps.
 */
export interface VaultOps {
  /** Return true if the file exists in the vault. */
  fileExists(vault: string, path: string): Promise<boolean>;
  /** Read a file and return its content and parsed frontmatter. */
  readFile(vault: string, path: string): Promise<VaultFile>;
  /** Create a new file with the given content; throws if the file already exists. */
  createFile(vault: string, path: string, content: string): Promise<void>;
  /** Merge the given key/value pairs into the file's frontmatter. */
  updateFrontmatter(vault: string, path: string, mutations: Record<string, unknown>): Promise<void>;
  /** Return all markdown files in the vault with their frontmatter. */
  listFiles(vault: string): Promise<VaultFileEntry[]>;
  /** Append a content block to today's daily note. */
  appendToDaily(vault: string, content: string): Promise<void>;
  /** Open today's daily note in the Obsidian UI. */
  openDaily(vault: string): Promise<void>;
  /** Return the paths of the most recently modified files, up to limit. */
  listRecentFiles(vault: string, limit: number, sort?: string): Promise<string[]>;
  /** Return wiki-link targets that have no corresponding file in the vault. */
  listUnresolved(vault: string): Promise<string[]>;
  /** Move the file to the vault trash. */
  trashFile(vault: string, path: string): Promise<void>;
  /** Append content to an existing file. */
  appendToFile(vault: string, path: string, content: string): Promise<void>;
  /** Overwrite the full content of an existing file. */
  replaceFileContent(vault: string, path: string, content: string): Promise<void>;
}
