/**
 * TypeScript port of cli/core/add-connection.sh.
 *
 * Writes a bidirectional typed connection between two notes, looking up the
 * inverse relationship type from the project's _ontology file.
 */

import { CONNECTION_LIMIT } from '../constants/limits';
import { logError, logWarn } from '../lib/logger';
import { getVaultOps } from '../ports/provider';
import { BUILTIN_RELATIONS, RelationType } from '../types/relation-type';
import { BaseCommand, type CommandContext } from './base-command';

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

type WriteResult = { written: boolean | 'skipped'; error: string };

/**
 * Read a note, check for duplicate/limit, append a connection line, and write back.
 * Returns the outcome without throwing.
 */
async function writeConnection(
  ops: ReturnType<typeof getVaultOps>,
  vault: string,
  filePath: string,
  targetBasename: string,
  relType: string,
  context: string
): Promise<WriteResult> {
  const file = await ops.readFile(vault, filePath);

  if (hasConnection(file.content, targetBasename)) {
    return { written: 'skipped', error: '' };
  }

  const count = countConnections(file.content);
  if (count >= CONNECTION_LIMIT) {
    const bn = basenameOf(filePath);
    return { written: false, error: `Connection limit (${CONNECTION_LIMIT}) reached on ${bn}` };
  }

  const result = appendToConnections(file.content, connLine(relType, targetBasename, context));
  if (result.error) {
    return { written: false, error: result.error };
  }

  await ops.replaceFileContent(vault, filePath, result.content);
  return { written: true, error: '' };
}

/**
 * Programmatic API for add-connection.
 */
export async function addConnection(
  params: AddConnectionParams
): Promise<{ ok: boolean; data: AddConnectionResult; error?: string }> {
  const { vault, sourcePath, relType, targetPath } = params;
  const context = (params.context ?? '').replace(/[\n\r]/g, '');

  const parsedRel = RelationType.parse(relType);
  if (!parsedRel) {
    const builtins = [...BUILTIN_RELATIONS.keys()].slice(0, 5).join(', ');
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: `add-connection: invalid rel_type '${relType}'. Must be lowercase alphanumeric with hyphens (e.g. ${builtins})`,
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
  const fwd = await writeConnection(ops, vault, sourcePath, targetBasename, relType, context);
  if (fwd.error) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: `add-connection: ${fwd.error}`,
    };
  }
  const forwardWritten = fwd.written;

  /* Write inverse connection */
  let inverseWritten: boolean | 'skipped' = false;
  let inverseError = '';

  if (inverseType) {
    const invCtx = context ? `inverse of: ${context}` : '';
    const inv = await writeConnection(ops, vault, targetPath, sourceBasename, inverseType, invCtx);
    inverseWritten = inv.written;
    inverseError = inv.error;
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

class AddConnectionCommand extends BaseCommand {
  readonly name = 'add-connection';
  readonly description = 'Write a typed bidirectional connection between two notes';
  readonly usage =
    'nerv add-connection [--vault <name>] <source_path> <rel_type> <target_path> [<context>]';
  readonly minPositional = 3;

  protected async execute(ctx: CommandContext): Promise<void> {
    const sourcePath = ctx.positional[0];
    const relType = ctx.positional[1];
    const targetPath = ctx.positional[2];
    const context = ctx.positional[3] ?? '';

    if (!REL_TYPE_RE.test(relType)) {
      logError(
        `add-connection: rel_type must be lowercase alphanumeric with hyphens (got: ${relType})`
      );
    }

    const result = await addConnection({
      vault: ctx.vault,
      sourcePath,
      relType,
      targetPath,
      context,
    });

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
  }
}

export default new AddConnectionCommand();
