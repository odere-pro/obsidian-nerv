/**
 * TypeScript port of cli/core/add-connection.sh.
 *
 * Writes a bidirectional typed connection between two notes, looking up the
 * inverse relationship type from the project's _ontology file.
 */

import type { Command } from '../cli';
import { CONNECTION_LIMIT } from '../constants/limits';
import { logError, logWarn } from '../lib/logger';
import { SLUG_PATTERN } from '../lib/markdown';
import { resolveVault } from '../lib/obsidian';
import { getVaultOps } from '../ports/provider';
import { extractVaultFlag } from '../lib/vault-registry';

const REL_TYPE_RE = SLUG_PATTERN;

export interface AddConnectionParams {
  vault: string;
  sourcePath: string;
  relType: string;
  targetPath: string;
  context?: string;
}

export interface AddConnectionResult {
  forwardWritten: boolean | 'skipped';
  inverseWritten: boolean | 'skipped';
  inverseError: string;
}

function basenameOf(path: string): string {
  return (path.split('/').pop() ?? '').replace(/\.md$/, '');
}

function titleAlias(basename: string): string {
  return basename.replace(/^[A-Z0-9]+\.[a-z0-9-]+ - /, '');
}

function connLine(type: string, targetBasename: string, ctx: string): string {
  const alias = titleAlias(targetBasename);
  const link = `[[${targetBasename}|${alias}]]`;
  return `- ${type} :: ${link}${ctx ? ` \u2014 ${ctx}` : ''}`;
}

function countConnections(body: string): number {
  const m = body.match(/^- [a-z][a-z0-9-]* :: \[\[/gm);
  return m ? m.length : 0;
}

function hasConnection(body: string, targetBasename: string): boolean {
  return body.includes(`[[${targetBasename}`);
}

function appendToConnections(body: string, line: string): { content: string; error: string } {
  let idx = body.indexOf('\n## Connections');
  if (idx === -1) idx = body.indexOf('## Connections');
  if (idx === -1) return { content: body, error: 'no ## Connections section' };
  const afterConn = body.indexOf('\n## ', idx + 1);
  const insertAt = afterConn !== -1 ? afterConn : body.length;
  const before = body.substring(0, insertAt).trimEnd();
  const after = body.substring(insertAt);
  return { content: `${before}\n${line}\n${after}`, error: '' };
}

/**
 * Programmatic API for add-connection.
 */
export async function addConnection(
  params: AddConnectionParams
): Promise<{ ok: boolean; data: AddConnectionResult; error?: string }> {
  const { vault, sourcePath, relType, targetPath } = params;
  const context = (params.context ?? '').replace(/[\n\r]/g, '');

  if (!REL_TYPE_RE.test(relType)) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: `add-connection: rel_type must be lowercase alphanumeric with hyphens (got: ${relType})`,
    };
  }

  /* Derive project slug from source path (projects/<slug>/...) */
  const slugMatch = /^projects\/([^/]+)\//.exec(sourcePath);
  if (!slugMatch) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: `add-connection: cannot derive project slug from path: ${sourcePath}`,
    };
  }
  const projectSlug = slugMatch[1];
  const ontologyPath = `projects/${projectSlug}/_ontology.${projectSlug}.md`;

  const ops = getVaultOps();

  /* Look up inverse type and symmetric flag from the ontology file */
  let inverseType = '';
  let symmetric = false;

  try {
    const ontFile = await ops.readFile(vault, ontologyPath);
    const lines = ontFile.content.split('\n');
    for (const line of lines) {
      if (line.charAt(0) !== '|') continue;
      const cols = line.split('|').map(c => c.trim().replace(/`/g, ''));
      if (cols[1] === relType) {
        inverseType = cols[3] || '';
        symmetric =
          (cols[4] || '').toLowerCase() === 'yes' || (cols[4] || '').toLowerCase() === 'true';
        break;
      }
    }
  } catch {
    logWarn('add-connection: could not read ontology; inverse will be skipped');
  }

  if (symmetric) {
    inverseType = relType;
  }

  if (!inverseType) {
    logWarn(`add-connection: unknown relationship type "${relType}" — inverse will not be written`);
  }

  /* Verify source and target exist */
  const sourceExists = await ops.fileExists(vault, sourcePath).catch(() => false);
  if (!sourceExists) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: `add-connection: source not found: ${sourcePath}`,
    };
  }

  const targetExists = await ops.fileExists(vault, targetPath).catch(() => false);
  if (!targetExists) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: `add-connection: target not found: ${targetPath}`,
    };
  }

  const sourceBasename = basenameOf(sourcePath);
  const targetBasename = basenameOf(targetPath);

  /* Write forward connection */
  const sourceFile = await ops.readFile(vault, sourcePath);
  let forwardWritten: boolean | 'skipped';

  if (hasConnection(sourceFile.content, targetBasename)) {
    forwardWritten = 'skipped';
  } else {
    const count = countConnections(sourceFile.content);
    if (count >= CONNECTION_LIMIT) {
      return {
        ok: false,
        data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
        error: `add-connection: Connection limit (${CONNECTION_LIMIT}) reached on ${sourceBasename}`,
      };
    }
    const result = appendToConnections(
      sourceFile.content,
      connLine(relType, targetBasename, context)
    );
    if (result.error) {
      return {
        ok: false,
        data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
        error: `add-connection: ${result.error}`,
      };
    }
    await ops.replaceFileContent(vault, sourcePath, result.content);
    forwardWritten = true;
  }

  /* Write inverse connection */
  let inverseWritten: boolean | 'skipped' = false;
  let inverseError = '';

  if (inverseType) {
    const targetFile = await ops.readFile(vault, targetPath);

    if (hasConnection(targetFile.content, sourceBasename)) {
      inverseWritten = 'skipped';
    } else {
      const count = countConnections(targetFile.content);
      if (count >= CONNECTION_LIMIT) {
        inverseError = `Connection limit (${CONNECTION_LIMIT}) reached on ${targetBasename}`;
      } else {
        const invCtx = context ? `inverse of: ${context}` : '';
        const result = appendToConnections(
          targetFile.content,
          connLine(inverseType, sourceBasename, invCtx)
        );
        if (result.error) {
          inverseError = result.error;
        } else {
          await ops.replaceFileContent(vault, targetPath, result.content);
          inverseWritten = true;
        }
      }
    }
  }

  return {
    ok: true,
    data: {
      forwardWritten,
      inverseWritten,
      inverseError,
    },
  };
}

const command: Command = {
  name: 'add-connection',
  description: 'Write a typed bidirectional connection between two notes',
  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 3) {
      process.stderr.write(
        'Usage: nerv add-connection [--vault <name>] <source_path> <rel_type> <target_path> [<context>]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const sourcePath = rest[0];
    const relType = rest[1];
    const targetPath = rest[2];
    const context = rest[3] ?? '';

    if (!REL_TYPE_RE.test(relType)) {
      logError(
        `add-connection: rel_type must be lowercase alphanumeric with hyphens (got: ${relType})`
      );
    }

    const result = await addConnection({ vault, sourcePath, relType, targetPath, context });

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    const { forwardWritten, inverseWritten, inverseError } = result.data;

    if (forwardWritten === 'skipped') {
      process.stdout.write('INFO: forward connection already exists — skipped\n');
    } else if (forwardWritten) {
      process.stdout.write(`INFO: wrote ${relType} :: ${sourcePath} -> ${targetPath}\n`);
    }

    if (inverseWritten === 'skipped') {
      process.stdout.write('INFO: inverse connection already exists — skipped\n');
    } else if (inverseWritten) {
      process.stdout.write('INFO: wrote inverse connection\n');
    } else if (inverseError) {
      process.stderr.write(`WARN: inverse not written: ${inverseError}\n`);
    }
  },
};

export default command;
