// Obsidian vault .obsidian/ configuration JSON files.
// Each config lives as a real .json file in src/configuration/.
// init-vault imports them via Bun and writes them into the vault.

import appConfig from './app.json';
import bookmarksConfig from './bookmarks.json';
import corePluginsMigrationConfig from './core-plugins-migration.json';
import corePluginsConfig from './core-plugins.json';
import dailyNotesConfig from './daily-notes.json';
import graphConfig from './graph.json';
import hotkeysConfig from './hotkeys.json';
import templatesConfig from './templates.json';
import workspaceConfig from './workspace.json';
import workspacesConfig from './workspaces.json';

export {
  appConfig,
  bookmarksConfig,
  corePluginsConfig,
  corePluginsMigrationConfig,
  dailyNotesConfig,
  graphConfig,
  hotkeysConfig,
  templatesConfig,
  workspaceConfig,
  workspacesConfig,
};
