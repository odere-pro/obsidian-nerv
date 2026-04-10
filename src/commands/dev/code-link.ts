/**
 * code-link — Dev skill: append a code-path reference to ## Connections.
 *
 * Appends "- implements :: `<codepath>`" to the note's ## Connections section.
 * Idempotent: exits 0 if exact code path already present.
 * Security: rejects code paths containing ]] or newlines.
 */

import { BaseCommand, type CommandContext } from '../base-command';
import type { CommandResult } from '../../types/result';
import { getVaultOps } from '../../ports/provider';

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

export function appendCodeLink(
  content: string,
  codePath: string
): { content: string; appended: boolean } {
  const newLine = `- implements :: \`${codePath}\``;
  const marker = '## Connections';
  const idx = content.indexOf(marker);

  if (idx === -1) return { content, appended: false };

  const afterMarker = content.substring(idx + marker.length);
  const nextSection = afterMarker.match(/\n## /);
  const connSection = nextSection ? afterMarker.substring(0, nextSection.index) : afterMarker;

  if (connSection.indexOf(codePath) !== -1) {
    return { content, appended: false };
  }

  if (nextSection) {
    const insertAt = idx + marker.length + (nextSection.index ?? 0);
    return {
      content: content.substring(0, insertAt) + '\n' + newLine + content.substring(insertAt),
      appended: true,
    };
  }

  return {
    content: content.trimEnd() + '\n' + newLine + '\n',
    appended: true,
  };
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

  const ops = getVaultOps();

  let file;
  try {
    file = await ops.readFile(vault, notePath);
  } catch {
    return {
      ok: false,
      data: { appended: false, note: notePath, codePath },
      error: `code-link: note not found: ${notePath}`,
    };
  }

  const result = appendCodeLink(file.content, codePath);

  if (result.appended) {
    try {
      await ops.replaceFileContent(vault, notePath, result.content);
    } catch {
      return {
        ok: false,
        data: { appended: false, note: notePath, codePath },
        error: 'code-link: could not write updated content',
      };
    }
  }

  return {
    ok: true,
    data: {
      appended: result.appended,
      note: notePath,
      codePath,
    },
  };
}

class CodeLinkCommand extends BaseCommand {
  readonly name = 'dev/code-link';
  readonly description = 'Append a code-path reference to ## Connections in a note';
  readonly usage = 'nerv dev/code-link [--vault <name>] "<note-path>" "<code-path>"';
  readonly minPositional = 2;

  protected async execute(ctx: CommandContext): Promise<void> {
    const notePath = ctx.positional[0];
    const codePath = ctx.positional[1];

    const result = await codeLink(ctx.vault, notePath, codePath);

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
  }
}

export default new CodeLinkCommand();
