//
// TypeScript port of bootstrap-vault.sh — idempotent Obsidian vault provisioner.
// Usage: nerv init-vault <name> <path>
//
// initVault() handles vault filesystem provisioning + git init (fully unit-testable).
// Host-level side effects (agent deploy, PATH patching) live in the CLI run() adapter.

import { basename, dirname, join, resolve } from 'node:path';
import type { Command } from '../cli';
import {
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
} from '../configuration/obsidian';
import { logWarn } from '../lib/logger';
import { spawnCapture } from '../lib/shell';
import { auditDraftsYml } from '../templates/audit-drafts';
import { auditMissingPropertiesYml } from '../templates/audit-missing-properties';
import { auditOrphansYml } from '../templates/audit-orphans';
import { renderBranch } from '../templates/branch';
import { renderDaily } from '../templates/daily';
import { renderInbox } from '../templates/inbox';
import { renderLeaf } from '../templates/leaf';
import { renderVaultOntology } from '../templates/ontology';
import { renderRoot } from '../templates/root';
import { renderVaultTopk } from '../templates/topk';
import { vaultProjectBaseYml } from '../templates/vault-project-base';
import { renderVaultVocab } from '../templates/vocab';

async function mkdirp(dir: string): Promise<void> {
  await Bun.$`mkdir -p ${dir}`.quiet();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Vault name must not contain spaces or path separator characters. */
const NAME_RE = /^[^\s/\\]+$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitVaultParams {
  /** Vault name — used in git commit message and agent config lookup. */
  name: string;
  /** Absolute path to the vault root directory (need not exist yet). */
  path: string;
}

export interface InitVaultResult {
  created: string[];
  skipped: string[];
}

// ---------------------------------------------------------------------------
// Directories to create inside the vault (relative to vault root)
// ---------------------------------------------------------------------------

export const VAULT_DIRS: readonly string[] = [
  '.obsidian',
  '_inbox',
  '_templates',
  '_scripts',
  '_scripts/cli',
  '_bases',
  'journals/daily',
  'projects',
];

// ---------------------------------------------------------------------------
// Pure: build the complete file map — relative path → file content
// ---------------------------------------------------------------------------

export function buildVaultFileMap(): Record<string, string> {
  return {
    // ---- Obsidian config (from src/configuration/*.json) ----
    '.obsidian/app.json': JSON.stringify(appConfig, null, 2),
    '.obsidian/core-plugins.json': JSON.stringify(corePluginsConfig, null, 2),
    '.obsidian/core-plugins-migration.json': JSON.stringify(corePluginsMigrationConfig, null, 2),
    '.obsidian/templates.json': JSON.stringify(templatesConfig, null, 2),
    '.obsidian/daily-notes.json': JSON.stringify(dailyNotesConfig, null, 2),
    '.obsidian/hotkeys.json': JSON.stringify(hotkeysConfig, null, 2),
    '.obsidian/graph.json': JSON.stringify(graphConfig, null, 2),
    '.obsidian/workspace.json': JSON.stringify(workspaceConfig, null, 2),
    '.obsidian/workspaces.json': JSON.stringify(workspacesConfig, null, 2),
    '.obsidian/bookmarks.json': JSON.stringify(bookmarksConfig, null, 2),

    // ---- Markdown templates (reuse render functions from src/templates/) ----

    '_templates/tpl-root.md': renderRoot({
      title: '{{title}}',
      kind: 'concept',
      spine: '{{title}}',
      status: 'draft',
      created: '{{date}}',
      modified: '{{date}}',
    }),

    '_templates/tpl-branch.md': renderBranch({
      title: '{{title}}',
      slug: '',
      project: '',
      kind: 'concept',
      spine: '',
      status: 'draft',
      parent: '',
      created: '{{date}}',
      modified: '{{date}}',
    }),

    '_templates/tpl-leaf.md': renderLeaf({
      title: '{{title}}',
      slug: '',
      project: '',
      kind: 'concept',
      spine: '',
      status: 'draft',
      parent: '',
      created: '{{date}}',
      modified: '{{date}}',
    }),

    '_templates/tpl-inbox.md': renderInbox({
      title: '{{title}}',
      captured: '{{date}}',
    }),

    '_templates/tpl-daily.md': renderDaily({ date: '{{date}}' }),

    '_templates/tpl-ontology.md': renderVaultOntology({
      title: '{{title}}',
      created: '{{date}}',
      modified: '{{date}}',
    }),

    '_templates/tpl-vocab.md': renderVaultVocab({
      title: '{{title}}',
      created: '{{date}}',
      modified: '{{date}}',
    }),

    '_templates/tpl-topk.md': renderVaultTopk({
      title: '{{title}}',
      created: '{{date}}',
      modified: '{{date}}',
    }),

    '_templates/tpl-project.base': vaultProjectBaseYml,

    // ---- Audit bases ----

    '_bases/audit-missing-properties.base': auditMissingPropertiesYml,
    '_bases/audit-drafts.base': auditDraftsYml,
    '_bases/audit-orphans.base': auditOrphansYml,
  };
}

// ---------------------------------------------------------------------------
// Filesystem helper
// ---------------------------------------------------------------------------

async function writeIfAbsent(
  filePath: string,
  content: string,
  result: InitVaultResult
): Promise<void> {
  if (!(await Bun.file(filePath).exists())) {
    await mkdirp(dirname(filePath));
    await Bun.write(filePath, content);
    result.created.push(filePath);
    process.stdout.write(`    created: ${filePath}\n`);
  } else {
    result.skipped.push(filePath);
  }
}

// ---------------------------------------------------------------------------
// Git operations (uses spawnCapture — mockable in unit tests)
// ---------------------------------------------------------------------------

export async function gitInit(
  vaultPath: string,
  vaultName: string,
  result: InitVaultResult
): Promise<void> {
  const gitHead = join(vaultPath, '.git', 'HEAD');
  if (await Bun.file(gitHead).exists()) {
    process.stdout.write('    git: already initialized — skipped\n');
    return;
  }

  const { exitCode } = await spawnCapture(['git', '-C', vaultPath, 'init', '-q']);
  if (exitCode !== 0) {
    logWarn('git init failed — vault files were created but not committed');
    return;
  }

  await writeIfAbsent(
    join(vaultPath, '.gitignore'),
    '.obsidian/workspace.json\n.obsidian/workspaces.json\n.DS_Store\n',
    result
  );

  await spawnCapture(['git', '-C', vaultPath, 'add', '.']);
  await spawnCapture([
    'git',
    '-C',
    vaultPath,
    'commit',
    '-q',
    '-m',
    `chore: bootstrap vault '${vaultName}' via nerv init-vault`,
  ]);
  process.stdout.write('    git: initialized and committed\n');
}

// ---------------------------------------------------------------------------
// Main programmatic API — vault structure only (no host side-effects)
// ---------------------------------------------------------------------------

export async function initVault(params: InitVaultParams): Promise<InitVaultResult> {
  const { name, path: vaultPath } = params;

  if (!NAME_RE.test(name)) {
    throw new Error(
      `init-vault: name must not contain spaces or path separators (got: ${JSON.stringify(name)})`
    );
  }

  const result: InitVaultResult = { created: [], skipped: [] };
  process.stdout.write(`==> Bootstrapping vault '${name}' at '${vaultPath}'\n`);

  // 1. Create vault directories
  for (const dir of VAULT_DIRS) {
    await mkdirp(join(vaultPath, dir));
  }

  // 2. Write all vault files (idempotent — existing files are never overwritten)
  const fileMap = buildVaultFileMap();
  for (const [relPath, content] of Object.entries(fileMap)) {
    await writeIfAbsent(join(vaultPath, relPath), content, result);
  }

  // 3. Git init + initial commit
  await gitInit(vaultPath, name, result);

  process.stdout.write(`\n==> Vault '${name}' ready at '${vaultPath}'\n`);
  process.stdout.write('    Next: open vault in Obsidian and complete manual setup.\n');

  return result;
}

// ---------------------------------------------------------------------------
// Host-level helpers (agent deploy + PATH) — called by CLI run() only
// ---------------------------------------------------------------------------

const PATH_MARKER = '# ontology-cli PATH — added by nerv init-vault';
const PATH_EXPORT = 'export PATH="${HOME}/.ontology-cli/bin:${PATH}"';

export async function ensureZprofilePath(
  zprofile: string = join(Bun.env.HOME ?? '', '.zprofile')
): Promise<void> {
  const existing = (await Bun.file(zprofile).exists()) ? await Bun.file(zprofile).text() : '';
  if (!existing.includes(PATH_MARKER)) {
    await Bun.write(zprofile, existing + `\n${PATH_MARKER}\n${PATH_EXPORT}\n`);
    process.stdout.write(`    appended PATH export to ${zprofile}\n`);
  } else {
    process.stdout.write(`    PATH export already present in ${zprofile} — skipped\n`);
  }
}

export async function deployAgentFiles(vaultName: string, vaultPath: string): Promise<void> {
  // Infer repo root from running binary/script:
  //   dev:      argv[1] = <repo>/src/cli.ts  → dirname = <repo>/src  → up 1 = <repo>
  //   compiled: argv[1] = <repo>/bin/nerv    → dirname = <repo>/bin  → up 1 = <repo>
  const argv1 = process.argv[1] ?? '';
  const parentDir = dirname(argv1);
  const repoDir =
    basename(parentDir) === 'src' || basename(parentDir) === 'bin'
      ? resolve(parentDir, '..')
      : resolve(parentDir, '../..');

  const agentSrc = join(repoDir, 'cli', 'agent');
  const hostAgent = join(Bun.env.HOME ?? '', '.ontology-cli', 'agent');
  await mkdirp(hostAgent);

  for (const file of ['skills.md', 'patterns.md'] as const) {
    const src = join(agentSrc, file);
    const dst = join(hostAgent, file);
    if (await Bun.file(src).exists()) {
      await Bun.write(dst, Bun.file(src));
      process.stdout.write(`    deployed: ${dst}\n`);
    } else {
      logWarn(`agent file not found — skipping: ${src}`);
    }
  }

  const claudeSrc = join(agentSrc, vaultName, 'CLAUDE.md');
  if (await Bun.file(claudeSrc).exists()) {
    const claudeDst = join(vaultPath, 'CLAUDE.md');
    await Bun.write(claudeDst, Bun.file(claudeSrc));
    process.stdout.write(`    deployed: ${claudeDst}\n`);
  }

  // Deploy the nerv binary to ~/.ontology-cli/bin/
  const nativeBin = join(repoDir, 'bin', 'nerv');
  const hostBin = join(Bun.env.HOME ?? '', '.ontology-cli', 'bin');
  await mkdirp(hostBin);
  if (await Bun.file(nativeBin).exists()) {
    const dstBin = join(hostBin, 'nerv');
    await Bun.write(dstBin, Bun.file(nativeBin));
    void spawnCapture(['chmod', '+x', dstBin]);
    process.stdout.write(`    deployed: ${dstBin}\n`);
  } else {
    logWarn(`bin/nerv not found — run 'bun run build' in ${repoDir} first`);
  }
}

// ---------------------------------------------------------------------------
// CLI adapter
// ---------------------------------------------------------------------------

const command: Command = {
  name: 'init-vault',
  description: 'Provision a new Obsidian vault (idempotent)',
  async run(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write(
        'Usage: nerv init-vault --name <name> [--path <path>]\n  --name  Vault name (required)\n  --path  Vault root directory (default: ./docs/vaults)\n'
      );
      return;
    }

    const nameIdx = args.indexOf('--name');
    const pathIdx = args.indexOf('--path');
    const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;
    const rawPath = pathIdx !== -1 ? args[pathIdx + 1] : './docs/vaults';

    if (!name) {
      process.stderr.write('Usage: nerv init-vault --name <name> [--path <path>]\n');
      process.exit(1);
    }

    const vaultPath = resolve(rawPath.replace(/^~/, Bun.env.HOME ?? ''));

    await initVault({ name, path: vaultPath });
    await deployAgentFiles(name, vaultPath);
    await ensureZprofilePath();
  },
};

export default command;
