/**
 * Port interface for Obsidian plugin development operations.
 * These methods expose dev/debug capabilities; they have no realistic non-Obsidian backend.
 */
export interface DevOps {
  /** Hot-reload a plugin inside the running Obsidian instance. */
  reloadPlugin(vault: string, pluginId: string): Promise<void>;
  /** Capture and return any JS error messages logged by Obsidian. */
  captureErrors(vault: string): Promise<string>;
  /** Capture and return the current Obsidian console output. */
  captureConsole(vault: string): Promise<string>;
  /** Capture and return a screenshot of the Obsidian viewport. */
  captureScreenshot(vault: string): Promise<string>;
}
