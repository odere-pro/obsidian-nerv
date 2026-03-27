// code-link — Dev skill: append a code-path reference to ## Connections.
//
// Appends "- implements :: `<codepath>`" to the note's ## Connections section.
// Idempotent: exits 0 if exact code path already present.
// Security: rejects code paths containing ]] or newlines.

import type { Command } from '../../cli';
import { encodeForJs, parseJson } from '../../lib/json';
import { obEval, resolveVault } from '../../lib/obsidian';
import type { CommandResult } from '../../types/result';
import { extractVaultFlag } from '../../lib/vault-registry';

export interface CodeLinkData {
  appended: boolean;
  note: string;
  codePath: string;
}

export function validateCodePath(codePath: string): string | null {
  if (codePath.includes(']]')) {
    return 'code-link: code path must not contain "]]"';
  }
  if (codePath.includes('\n') || codePath.includes('\r')) {
    return 'code-link: code path must not contain newlines';
  }
  return null;
}

export async function codeLink(
  vault: string,
  notePath: string,
  codePath: string
): Promise<CommandResult<CodeLinkData>> {
  const validationError = validateCodePath(codePath);
  if (validationError) {
    return {
      ok: false,
      data: { appended: false, note: notePath, codePath },
      error: validationError,
    };
  }

  const jsPath = encodeForJs(notePath);
  const jsCode = encodeForJs(codePath);

  const raw = await obEval(
    vault,
    `(async () => {
  var notePath = ${jsPath};
  var codePath = ${jsCode};
  var newLine  = '- implements :: \`' + codePath + '\`';

  var f = app.vault.getAbstractFileByPath(notePath);
  if (!f) return JSON.stringify({ error: 'note not found: ' + notePath });

  var appended = false;

  await app.vault.process(f, function(content) {
    var marker = '## Connections';
    var idx    = content.indexOf(marker);
    if (idx === -1) return content;

    var afterMarker = content.substring(idx + marker.length);
    var nextSection = afterMarker.match(/\n## /);
    var connSection = nextSection
      ? afterMarker.substring(0, nextSection.index)
      : afterMarker;

    if (connSection.indexOf(codePath) !== -1) {
      return content;
    }

    appended = true;

    if (nextSection) {
      var insertAt = idx + marker.length + nextSection.index;
      return content.substring(0, insertAt) + '\n' + newLine + content.substring(insertAt);
    }
    return content.trimRight() + '\n' + newLine + '\n';
  });

  return JSON.stringify({ appended: appended, note: notePath, codePath: codePath });
})()`
  ).catch(() => '');

  if (!raw) {
    return {
      ok: false,
      data: { appended: false, note: notePath, codePath },
      error: 'code-link: Obsidian not reachable or eval failed',
    };
  }

  const data = parseJson<{ error?: string; appended?: boolean; note?: string; codePath?: string }>(
    raw
  );
  if (!data) {
    return {
      ok: false,
      data: { appended: false, note: notePath, codePath },
      error: 'code-link: invalid JSON from eval',
    };
  }

  if (data.error) {
    return {
      ok: false,
      data: { appended: false, note: notePath, codePath },
      error: `code-link: ${data.error}`,
    };
  }

  return {
    ok: true,
    data: {
      appended: data.appended ?? false,
      note: data.note ?? notePath,
      codePath: data.codePath ?? codePath,
    },
  };
}

const command: Command = {
  name: 'dev/code-link',
  description: 'Append a code-path reference to ## Connections in a note',

  async run(args: string[]): Promise<void> {
    const { vault: vaultArg, rest } = extractVaultFlag(args);

    if (rest.length < 2) {
      process.stderr.write(
        'Usage: nerv dev/code-link [--vault <name>] "<note-path>" "<code-path>"\n'
      );
      process.exit(1);
    }

    const vault = await resolveVault(vaultArg);
    const notePath = rest[0];
    const codePath = rest[1];

    const result = await codeLink(vault, notePath, codePath);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    if (result.data.appended) {
      process.stdout.write(`code-link: appended to ${result.data.note}\n`);
      process.stdout.write(`  - implements :: \`${result.data.codePath}\`\n`);
    } else {
      process.stdout.write(`code-link: already present (no change) in ${result.data.note}\n`);
    }
  },
};

export default command;
