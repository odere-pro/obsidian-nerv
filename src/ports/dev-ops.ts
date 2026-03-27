// Port interface for Obsidian plugin development operations.
// Separated from VaultOps because these have no realistic non-Obsidian backend.

export interface DevOps {
  reloadPlugin(vault: string, pluginId: string): Promise<void>;
  captureErrors(vault: string): Promise<string>;
  captureConsole(vault: string): Promise<string>;
  captureScreenshot(vault: string): Promise<string>;
}
