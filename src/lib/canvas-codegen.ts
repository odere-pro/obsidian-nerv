/**
 * Shared canvas write expression builder for Obsidian obEval.
 *
 * Consolidates the identical buildWriteExpr() function previously duplicated
 * across canvas/dependencies.ts, canvas/relations.ts, and canvas/tree.ts.
 */

import { encodeForJs } from './json';

/**
 * Build an obEval JS expression that creates or overwrites a canvas file.
 * Creates the parent folder if it does not exist.
 */
export function buildWriteExpr(filePath: string, content: string): string {
  const jsPath = encodeForJs(filePath);
  const jsContent = encodeForJs(content);
  return `(async () => {
  var path = ${jsPath};
  var content = ${jsContent};
  var existing = app.vault.getAbstractFileByPath(path);
  if (existing) {
    await app.vault.modify(existing, content);
  } else {
    var parts = path.split('/');
    parts.pop();
    var dir = parts.join('/');
    var dirFile = app.vault.getAbstractFileByPath(dir);
    if (!dirFile) await app.vault.createFolder(dir);
    await app.vault.create(path, content);
  }
})()`;
}
