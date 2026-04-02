/**
 * DevOps implementation backed by the Obsidian CLI.
 * Each method translates a domain-level dev operation into a spawnCapture call.
 */

import { logError } from '../lib/logger';
import { spawnCapture } from '../lib/shell';
import type { DevOps } from '../ports/dev-ops';

export class ObsidianDevAdapter implements DevOps {
  async reloadPlugin(vault: string, pluginId: string): Promise<void> {
    const { exitCode, stderr } = await spawnCapture([
      'obsidian',
      'plugin:reload',
      `vault=${vault}`,
      `plugin=${pluginId}`,
    ]);
    if (exitCode !== 0) {
      logError(`plugin:reload failed for "${pluginId}"${stderr ? `: ${stderr.trim()}` : ''}`);
    }
  }

  async captureErrors(vault: string): Promise<string> {
    const { stdout } = await spawnCapture(['obsidian', 'dev:errors', `vault=${vault}`]);
    return stdout;
  }

  async captureConsole(vault: string): Promise<string> {
    const { stdout } = await spawnCapture(['obsidian', 'dev:console', `vault=${vault}`]);
    return stdout;
  }

  async captureScreenshot(vault: string): Promise<string> {
    const { stdout } = await spawnCapture(['obsidian', 'dev:screenshot', `vault=${vault}`]);
    return stdout;
  }
}
