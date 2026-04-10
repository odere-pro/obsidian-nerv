/**
 * Port interface for vault I/O operations.
 * Commands depend on this contract — never on a concrete backend.
 *
 * The interface is decomposed into focused sub-interfaces following the
 * Interface Segregation Principle. Commands can import the narrow interface
 * they need (e.g., FileReadOps) rather than the full VaultOps.
 *
 * VaultOps itself is a union of all sub-interfaces, so existing code that
 * imports VaultOps continues to work without changes.
 */

/* ---------------------------------------------------------------------------
 * Data types
 * --------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------
 * Segregated interfaces
 * --------------------------------------------------------------------------- */

/** Read-only file access: existence checks, reads, and listings. */
export interface FileReadOps {
  /** Return true if the file exists in the vault. */
  fileExists(vault: string, path: string): Promise<boolean>;
  /** Read a file and return its content and parsed frontmatter. */
  readFile(vault: string, path: string): Promise<VaultFile>;
  /**
   * Read multiple files in a single batch call.
   * Returns one VaultFile per path, in the same order as the input array.
   * Reduces N+1 IPC overhead when reading many files after listFiles().
   */
  readFiles(vault: string, paths: string[]): Promise<VaultFile[]>;
  /** Return all markdown files in the vault with their frontmatter. */
  listFiles(vault: string): Promise<VaultFileEntry[]>;
}

/** Write operations: create, append, replace, trash. */
export interface FileWriteOps {
  /** Create a new file with the given content; throws if the file already exists. */
  createFile(vault: string, path: string, content: string): Promise<void>;
  /** Append content to an existing file. */
  appendToFile(vault: string, path: string, content: string): Promise<void>;
  /** Overwrite the full content of an existing file. */
  replaceFileContent(vault: string, path: string, content: string): Promise<void>;
  /** Move the file to the vault trash. */
  trashFile(vault: string, path: string): Promise<void>;
}

/** Frontmatter-specific mutations. */
export interface FrontmatterOps {
  /** Merge the given key/value pairs into the file's frontmatter. */
  updateFrontmatter(vault: string, path: string, mutations: Record<string, unknown>): Promise<void>;
}

/** Daily note operations. */
export interface DailyOps {
  /** Append a content block to today's daily note. */
  appendToDaily(vault: string, content: string): Promise<void>;
  /** Open today's daily note in the Obsidian UI. */
  openDaily(vault: string): Promise<void>;
}

/** Link-graph queries. */
export interface LinkOps {
  /** Return the paths of the most recently modified files, up to limit. */
  listRecentFiles(vault: string, limit: number, sort?: string): Promise<string[]>;
  /** Return wiki-link targets that have no corresponding file in the vault. */
  listUnresolved(vault: string): Promise<string[]>;
}

/* ---------------------------------------------------------------------------
 * Union interface — backward-compatible
 * --------------------------------------------------------------------------- */

/**
 * Full vault operations port — union of all segregated interfaces.
 *
 * The production implementation is ObsidianCliAdapter; the test double is MockVaultOps.
 * Commands that only need a subset can type their dependency as e.g. FileReadOps
 * instead of the full VaultOps.
 */
export interface VaultOps extends FileReadOps, FileWriteOps, FrontmatterOps, DailyOps, LinkOps {}
