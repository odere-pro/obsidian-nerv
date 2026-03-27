// STORY-037 — Migrate domain skills (study + dev) to TypeScript
// quiz — Study skill: extract a shuffled note bundle for quiz generation.
//
// Returns a vault-grounded quiz bundle: instruction, spine, and shuffled notes
// with title, kind, summary, first-500-chars of content, and typed connections.
// Excludes draft-status notes.

import type { Command } from '../../cli';
import { encodeForJs, parseJson } from '../../lib/json';
import { obEval, resolveVault } from '../../lib/obsidian';
import type { CommandResult } from '../../types/result';

const QUIZ_INSTRUCTION =
  "You are a quiz generator grounded exclusively in the user's knowledge vault. " +
  'Generate quiz questions that can ONLY be answered from the note content provided ' +
  'below. Do not ask questions that require knowledge not present in the provided ' +
  'notes — reject any question that cannot be answered from the supplied content. ' +
  'For each question, cite the source note title. ' +
  'After the quiz, identify which notes correspond to incorrectly answered questions ' +
  'and offer the user a chance to review or enrich those specific notes in their vault.';

export interface QuizNote {
  title: string;
  kind: string;
  summary: string;
  content: string;
  connections: Array<{ rel: string; target: string }>;
}

export interface QuizData {
  instruction: string;
  spine: string;
  notes: QuizNote[];
}

export function shuffleAndLimit<T>(items: T[], limit: number, seed?: number): T[] {
  const arr = [...items];
  const rng =
    seed !== undefined
      ? (() => {
          let s = seed;
          return () => {
            s = (s * 1664525 + 1013904223) & 0x7fffffff;
            return s / 0x7fffffff;
          };
        })()
      : () => Math.random();

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, limit);
}

export async function getQuiz(
  vault: string,
  project: string,
  spine: string,
  limit = 5
): Promise<CommandResult<QuizData>> {
  const jsSlug = encodeForJs(project);
  const jsSpine = encodeForJs(spine);

  const raw = await obEval(
    vault,
    `(async () => {
  var slug    = ${jsSlug};
  var spine   = ${jsSpine};
  var projDir = 'projects/' + slug;

  var notes = app.vault.getMarkdownFiles().filter(function(f) {
    if (!f.path.startsWith(projDir + '/')) return false;
    var n = f.name;
    if (n.startsWith('_vocab') || n.startsWith('_topk') ||
        n.startsWith('_ontology') || n.startsWith('tpl-')) return false;
    var cache  = app.metadataCache.getFileCache(f);
    var fm     = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var fSpine = String(fm.spine  || '');
    var status = String(fm.status || 'draft');
    return fSpine === spine && status !== 'draft';
  });

  var results = [];

  for (var i = 0; i < notes.length; i++) {
    var f     = notes[i];
    var cache = app.metadataCache.getFileCache(f);
    var fm    = (cache && cache.frontmatter) ? cache.frontmatter : {};
    var body  = await app.vault.cachedRead(f);
    var bt    = body.replace(/^---[\\s\\S]*?---\\n?/, '');

    var sumM    = bt.match(/^## Summary\\s*\\n([\\s\\S]*?)(?=\\n## |$)/m);
    var summary = sumM ? sumM[1].trim() : '';

    var conM    = bt.match(/^## Content\\s*\\n([\\s\\S]*?)(?=\\n## |$)/m);
    var content = conM ? conM[1].trim().substring(0, 500) : '';

    var connections = [];
    var connM = bt.match(/^## Connections\\s*\\n([\\s\\S]*?)(?=\\n## |$)/m);
    if (connM) {
      var lines = connM[1].split('\\n');
      for (var c = 0; c < lines.length; c++) {
        var m = lines[c].match(/^- ([a-z][a-z0-9-]*) :: \\[\\[([^\\]]+)\\]\\]/);
        if (m) connections.push({ rel: m[1], target: m[2] });
      }
    }

    results.push({
      title:       String(fm.title || f.basename),
      kind:        String(fm.kind  || ''),
      summary:     summary,
      content:     content,
      connections: connections
    });
  }

  return JSON.stringify(results);
})()`
  ).catch(() => '');

  if (!raw) {
    return {
      ok: false,
      data: { instruction: QUIZ_INSTRUCTION, spine, notes: [] },
      error: 'quiz: Obsidian not reachable or eval failed',
    };
  }

  const allNotes = parseJson<QuizNote[]>(raw);
  if (!allNotes) {
    return {
      ok: false,
      data: { instruction: QUIZ_INSTRUCTION, spine, notes: [] },
      error: 'quiz: invalid JSON from eval',
    };
  }

  const notes = shuffleAndLimit(allNotes, limit);

  return {
    ok: true,
    data: { instruction: QUIZ_INSTRUCTION, spine, notes },
  };
}

const command: Command = {
  name: 'study/quiz',
  description: 'Generate a vault-grounded quiz bundle from project notes',

  async run(args: string[]): Promise<void> {
    if (args.length < 3) {
      process.stderr.write('Usage: nerv study/quiz <vault> <project_slug> <spine> [<limit>]\n');
      process.exit(1);
    }

    const vault = await resolveVault(args[0]);
    const project = args[1];
    const spine = args[2];
    const limit = args[3] ? parseInt(args[3], 10) : 5;

    if (isNaN(limit) || limit < 1) {
      process.stderr.write(`ERROR: quiz: limit must be a positive integer (got: ${args[3]})\n`);
      process.exit(1);
    }

    const result = await getQuiz(vault, project, spine, limit);

    if (!result.ok) {
      process.stderr.write(`ERROR: ${result.error}\n`);
      process.exit(1);
    }

    process.stdout.write(JSON.stringify(result.data) + '\n');
  },
};

export default command;
