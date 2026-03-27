// STORY-033 — Motor skills migration: add-connection command
//
// TypeScript port of cli/core/add-connection.sh.
// Writes a bidirectional typed connection between two notes, looking up the
// inverse relationship type from the project's _ontology file.

import type { Command } from '../cli';
import { encodeForJs, parseJson } from '../lib/json';
import { logError, logWarn } from '../lib/logger';
import { obEval, resolveVault } from '../lib/obsidian';

const REL_TYPE_RE = /^[a-z][a-z0-9-]*$/;

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

  // Derive project slug from source path (projects/<slug>/...)
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

  // Look up inverse type and symmetric flag from the ontology file
  const lookupJs = `(async () => {
  var ontPath = ${encodeForJs(ontologyPath)};
  var relType = ${encodeForJs(relType)};
  var f = app.vault.getAbstractFileByPath(ontPath);
  if (!f) return JSON.stringify({error: 'ontology not found: ' + ontPath});
  var body = await app.vault.cachedRead(f);
  var lines = body.split('\\n');
  var inverse = '';
  var symmetric = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.charAt(0) !== '|') continue;
    var cols = line.split('|').map(function(c) { return c.trim().replace(/\x60/g, ''); });
    if (cols[1] === relType) {
      inverse   = cols[3] || '';
      symmetric = (cols[4] || '').toLowerCase() === 'yes' || (cols[4] || '').toLowerCase() === 'true';
      break;
    }
  }
  return JSON.stringify({inverse: inverse, symmetric: symmetric});
})()`;

  const lookupRaw = await obEval(vault, lookupJs).catch(() => '');

  let inverseType = '';
  let symmetric = false;

  if (!lookupRaw) {
    logWarn('add-connection: could not read ontology; inverse will be skipped');
  } else {
    const lookup = parseJson<{ error?: string; inverse: string; symmetric: boolean }>(lookupRaw);
    if (!lookup) {
      logWarn('add-connection: could not parse ontology lookup result; inverse will be skipped');
    } else if (lookup.error) {
      logWarn(`add-connection: ${lookup.error}; inverse will be skipped`);
    } else {
      inverseType = lookup.inverse;
      symmetric = lookup.symmetric;
    }
  }

  if (symmetric) {
    inverseType = relType;
  }

  if (!inverseType) {
    logWarn(`add-connection: unknown relationship type "${relType}" — inverse will not be written`);
  }

  // Write forward and inverse connections atomically via vault.process
  const writeJs = `(async () => {
  var sourcePath   = ${encodeForJs(sourcePath)};
  var targetPath   = ${encodeForJs(targetPath)};
  var relType      = ${encodeForJs(relType)};
  var inverseType  = ${encodeForJs(inverseType)};
  var ctx          = ${encodeForJs(context)};
  var LIMIT        = 7;

  function titleAlias(basename) {
    return basename.replace(/^[A-Z0-9]+\\.[a-z0-9-]+ - /, '');
  }

  function connLine(type, targetBasename, context) {
    var alias = titleAlias(targetBasename);
    var link  = '[[' + targetBasename + '|' + alias + ']]';
    return '- ' + type + ' :: ' + link + (context ? ' \\u2014 ' + context : '');
  }

  function countConnections(body) {
    var m = body.match(/^- [a-z][a-z0-9-]* :: \\[\\[/gm);
    return m ? m.length : 0;
  }

  function hasConnection(body, targetBasename) {
    return body.indexOf('[[' + targetBasename) !== -1;
  }

  function appendToConnections(body, line) {
    var idx = body.indexOf('\\n## Connections');
    if (idx === -1) idx = body.indexOf('## Connections');
    if (idx === -1) return {content: body, error: 'no ## Connections section'};
    var afterConn = body.indexOf('\\n## ', idx + 1);
    var insertAt  = afterConn !== -1 ? afterConn : body.length;
    var before = body.substring(0, insertAt).trimEnd();
    var after  = body.substring(insertAt);
    return {content: before + '\\n' + line + '\\n' + after, error: ''};
  }

  var sourceFile = app.vault.getAbstractFileByPath(sourcePath);
  if (!sourceFile) return JSON.stringify({error: 'source not found: ' + sourcePath});

  var targetFile = app.vault.getAbstractFileByPath(targetPath);
  if (!targetFile) return JSON.stringify({error: 'target not found: ' + targetPath});

  var forwardWritten = false;
  var inverseWritten = false;
  var forwardError   = '';
  var inverseError   = '';

  await app.vault.process(sourceFile, function(body) {
    if (hasConnection(body, targetFile.basename)) {
      forwardWritten = 'skipped';
      return body;
    }
    var count = countConnections(body);
    if (count >= LIMIT) {
      forwardError = 'Connection limit (' + LIMIT + ') reached on ' + sourceFile.basename;
      return body;
    }
    var result = appendToConnections(body, connLine(relType, targetFile.basename, ctx));
    if (result.error) { forwardError = result.error; return body; }
    forwardWritten = true;
    return result.content;
  });

  if (forwardError) return JSON.stringify({error: forwardError});

  if (inverseType && targetFile) {
    await app.vault.process(targetFile, function(body) {
      if (hasConnection(body, sourceFile.basename)) {
        inverseWritten = 'skipped';
        return body;
      }
      var count = countConnections(body);
      if (count >= LIMIT) {
        inverseError = 'Connection limit (' + LIMIT + ') reached on ' + targetFile.basename;
        return body;
      }
      var invCtx = ctx ? 'inverse of: ' + ctx : '';
      var result = appendToConnections(body, connLine(inverseType, sourceFile.basename, invCtx));
      if (result.error) { inverseError = result.error; return body; }
      inverseWritten = true;
      return result.content;
    });
  }

  return JSON.stringify({
    forwardWritten: forwardWritten,
    inverseWritten: inverseWritten,
    inverseError:   inverseError
  });
})()`;

  const writeRaw = await obEval(vault, writeJs).catch(() => '');

  if (!writeRaw) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: 'add-connection: Obsidian not reachable or eval failed',
    };
  }

  const writeResult = parseJson<{
    error?: string;
    forwardWritten: boolean | 'skipped';
    inverseWritten: boolean | 'skipped';
    inverseError: string;
  }>(writeRaw);

  if (!writeResult) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: 'add-connection: could not parse write result',
    };
  }

  if (writeResult.error) {
    return {
      ok: false,
      data: { forwardWritten: false, inverseWritten: false, inverseError: '' },
      error: `add-connection: ${writeResult.error}`,
    };
  }

  return {
    ok: true,
    data: {
      forwardWritten: writeResult.forwardWritten,
      inverseWritten: writeResult.inverseWritten,
      inverseError: writeResult.inverseError,
    },
  };
}

const command: Command = {
  name: 'add-connection',
  description: 'Write a typed bidirectional connection between two notes',
  async run(args: string[]): Promise<void> {
    if (args.length < 4) {
      process.stderr.write(
        'Usage: nerv add-connection <vault|vault=name> <source_path> <rel_type> <target_path> [<context>]\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(args[0]);
    const sourcePath = args[1];
    const relType = args[2];
    const targetPath = args[3];
    const context = args[4] ?? '';

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
