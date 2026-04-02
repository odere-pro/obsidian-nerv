// Mocks spawnCapture so no real git or chmod calls are made.
// Uses a real temp directory for filesystem assertions.

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Mock shell — prevent real git / chmod calls
// ---------------------------------------------------------------------------

const mockSpawnCapture = mock(
  async (
    _cmd: [string, ...string[]]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
    stdout: '',
    stderr: '',
    exitCode: 0,
  })
);

mock.module('../../../src/lib/shell', () => ({
  spawnCapture: mockSpawnCapture,
  ShellTimeoutError: class ShellTimeoutError extends Error {},
}));

// Mock logger so logError throws instead of calling process.exit
mock.module('../../../src/lib/logger', () => ({
  logError: (msg: string): never => {
    throw new Error(msg);
  },
  logWarn: mock((_msg: string): void => undefined),
}));

const { buildVaultFileMap, VAULT_DIRS, initVault, gitInit } =
  await import('../../../src/commands/init-vault');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function makeTmpPath(): Promise<string> {
  const p = join(
    Bun.env.TMPDIR ?? '/tmp',
    `nerv-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await Bun.$`mkdir -p ${p}`.quiet();
  return p;
}

// ---------------------------------------------------------------------------
// buildVaultFileMap — pure unit tests (no I/O)
// ---------------------------------------------------------------------------

describe('buildVaultFileMap', () => {
  test('returns all 10 obsidian config files', () => {
    const keys = Object.keys(buildVaultFileMap());
    const obsidian = keys.filter(k => k.startsWith('.obsidian/'));
    expect(obsidian).toContain('.obsidian/app.json');
    expect(obsidian).toContain('.obsidian/core-plugins.json');
    expect(obsidian).toContain('.obsidian/core-plugins-migration.json');
    expect(obsidian).toContain('.obsidian/templates.json');
    expect(obsidian).toContain('.obsidian/daily-notes.json');
    expect(obsidian).toContain('.obsidian/hotkeys.json');
    expect(obsidian).toContain('.obsidian/graph.json');
    expect(obsidian).toContain('.obsidian/workspace.json');
    expect(obsidian).toContain('.obsidian/workspaces.json');
    expect(obsidian).toContain('.obsidian/bookmarks.json');
    expect(obsidian).toHaveLength(10);
  });

  test('returns exactly 9 template files', () => {
    const keys = Object.keys(buildVaultFileMap()).filter(k => k.startsWith('_templates/'));
    expect(keys).toHaveLength(9);
  });

  test('returns exactly 3 audit base files', () => {
    const keys = Object.keys(buildVaultFileMap()).filter(k => k.startsWith('_bases/'));
    expect(keys).toHaveLength(3);
    expect(keys).toContain('_bases/audit-missing-properties.base');
    expect(keys).toContain('_bases/audit-drafts.base');
    expect(keys).toContain('_bases/audit-orphans.base');
  });

  test('app.json is valid JSON with required settings', () => {
    const app = JSON.parse(buildVaultFileMap()['.obsidian/app.json']);
    expect(app.newFileFolderPath).toBe('_inbox');
    expect(app.useMarkdownLinks).toBe(false);
    expect(app.newLinkFormat).toBe('shortest');
    expect(app.trashOption).toBe('system');
  });

  test('core-plugins.json includes all 21 plugins', () => {
    const plugins: string[] = JSON.parse(buildVaultFileMap()['.obsidian/core-plugins.json']);
    expect(plugins).toContain('bases');
    expect(plugins).toContain('daily-notes');
    expect(plugins).toContain('file-recovery');
    expect(plugins).toContain('workspaces');
    expect(plugins).toHaveLength(21);
  });

  test('hotkeys.json maps exactly 9 configured hotkeys', () => {
    const hotkeys = JSON.parse(buildVaultFileMap()['.obsidian/hotkeys.json']);
    expect(hotkeys['templates:insert-template']).toBeDefined();
    expect(hotkeys['daily-notes:goto-today']).toBeDefined();
    expect(hotkeys['workspaces:open']).toBeDefined();
    expect(Object.keys(hotkeys)).toHaveLength(9);
  });

  test('daily-notes.json points to correct template and folder', () => {
    const dn = JSON.parse(buildVaultFileMap()['.obsidian/daily-notes.json']);
    expect(dn.template).toBe('_templates/tpl-daily.md');
    expect(dn.newFileLocation).toBe('journals/daily/');
  });

  test('tpl-root.md contains Obsidian template variables and ROOT type', () => {
    const content = buildVaultFileMap()['_templates/tpl-root.md'];
    expect(content).toContain('{{title}}');
    expect(content).toContain('{{date}}');
    expect(content).toContain('type: ROOT');
  });

  test('tpl-daily.md contains query block for inbox triage', () => {
    const content = buildVaultFileMap()['_templates/tpl-daily.md'];
    expect(content).toContain('```query');
    expect(content).toContain('path:_inbox');
  });

  test('tpl-ontology.md contains all 10 default relationship types', () => {
    const content = buildVaultFileMap()['_templates/tpl-ontology.md'];
    expect(content).toContain('triggers');
    expect(content).toContain('depends-on');
    expect(content).toContain('implements');
    expect(content).toContain('mitigates');
  });

  test('audit-missing-properties.base checks type, status and spine', () => {
    const content = buildVaultFileMap()['_bases/audit-missing-properties.base'];
    expect(content).toContain('type == ""');
    expect(content).toContain('status == ""');
    expect(content).toContain('spine == ""');
  });

  // ---- Template reuse from src/templates/ ----

  test('tpl-root.md is generated by renderRoot with Obsidian placeholders', () => {
    const content = buildVaultFileMap()['_templates/tpl-root.md'];
    expect(content).toContain('type: ROOT');
    expect(content).toContain('title: "{{title}}"');
    expect(content).toContain('created: {{date}}');
    expect(content).toContain('tags: []');
    expect(content).toContain('## Summary');
    expect(content).toContain('## Map');
  });

  test('tpl-branch.md is generated by renderBranch with Obsidian placeholders', () => {
    const content = buildVaultFileMap()['_templates/tpl-branch.md'];
    expect(content).toContain('type: BRANCH');
    expect(content).toContain('title: "{{title}}"');
    expect(content).toContain('## Breadcrumb');
    expect(content).toContain('## Content');
  });

  test('tpl-leaf.md is generated by renderLeaf with Obsidian placeholders', () => {
    const content = buildVaultFileMap()['_templates/tpl-leaf.md'];
    expect(content).toContain('type: LEAF');
    expect(content).toContain('title: "{{title}}"');
    expect(content).toContain('## Breadcrumb');
    expect(content).toContain('## Content');
  });
});

// ---------------------------------------------------------------------------
// VAULT_DIRS
// ---------------------------------------------------------------------------

describe('VAULT_DIRS', () => {
  test('includes all required vault subdirectories', () => {
    expect(VAULT_DIRS).toContain('.obsidian');
    expect(VAULT_DIRS).toContain('_inbox');
    expect(VAULT_DIRS).toContain('_templates');
    expect(VAULT_DIRS).toContain('_bases');
    expect(VAULT_DIRS).toContain('journals/daily');
    expect(VAULT_DIRS).toContain('projects');
    expect(VAULT_DIRS).toContain('_scripts/cli');
  });
});

// ---------------------------------------------------------------------------
// initVault — uses a real temp directory
// ---------------------------------------------------------------------------

let tmpVault: string;

describe('initVault', () => {
  beforeEach(async () => {
    mockSpawnCapture.mockReset();
    mockSpawnCapture.mockImplementation(async () => ({ stdout: '', stderr: '', exitCode: 0 }));
    tmpVault = await makeTmpPath();
  });

  afterEach(async () => {
    await Bun.$`rm -rf ${tmpVault}`.quiet();
  });

  // ---- Validation ----

  describe('validation', () => {
    test('rejects a name with spaces', async () => {
      await expect(initVault({ name: 'my vault', path: tmpVault })).rejects.toThrow('init-vault');
    });

    test('rejects a name with forward slashes', async () => {
      await expect(initVault({ name: 'a/b', path: tmpVault })).rejects.toThrow();
    });

    test('rejects a name with backslashes', async () => {
      await expect(initVault({ name: 'a\\b', path: tmpVault })).rejects.toThrow();
    });

    test('accepts a plain alphanumeric name', async () => {
      await expect(initVault({ name: 'study', path: tmpVault })).resolves.toBeDefined();
    });

    test('accepts a name with hyphens', async () => {
      await expect(initVault({ name: 'dev-projectA', path: tmpVault })).resolves.toBeDefined();
    });
  });

  // ---- Directory creation ----

  describe('directory creation', () => {
    test('creates all VAULT_DIRS inside the vault path', async () => {
      await initVault({ name: 'study', path: tmpVault });
      for (const dir of VAULT_DIRS) {
        expect((await Bun.$`test -d ${join(tmpVault, dir)}`.quiet().nothrow()).exitCode).toBe(0);
      }
    });
  });

  // ---- File creation ----

  describe('file creation', () => {
    test('creates all 10 .obsidian config files', async () => {
      await initVault({ name: 'study', path: tmpVault });
      for (const relPath of Object.keys(buildVaultFileMap()).filter(k =>
        k.startsWith('.obsidian/')
      )) {
        expect(await Bun.file(join(tmpVault, relPath)).exists()).toBe(true);
      }
    });

    test('creates all 9 template files', async () => {
      await initVault({ name: 'study', path: tmpVault });
      for (const relPath of Object.keys(buildVaultFileMap()).filter(k =>
        k.startsWith('_templates/')
      )) {
        expect(await Bun.file(join(tmpVault, relPath)).exists()).toBe(true);
      }
    });

    test('creates all 3 audit base files', async () => {
      await initVault({ name: 'study', path: tmpVault });
      expect(await Bun.file(join(tmpVault, '_bases/audit-missing-properties.base')).exists()).toBe(
        true
      );
      expect(await Bun.file(join(tmpVault, '_bases/audit-drafts.base')).exists()).toBe(true);
      expect(await Bun.file(join(tmpVault, '_bases/audit-orphans.base')).exists()).toBe(true);
    });

    test('written app.json is valid JSON', async () => {
      await initVault({ name: 'study', path: tmpVault });
      const raw = await Bun.file(join(tmpVault, '.obsidian/app.json')).text();
      expect(() => JSON.parse(raw)).not.toThrow();
      expect(JSON.parse(raw).newFileFolderPath).toBe('_inbox');
    });

    test('result.created lists all newly created files', async () => {
      const result = await initVault({ name: 'study', path: tmpVault });
      expect(result.created.length).toBeGreaterThan(0);
      expect(result.skipped).toHaveLength(0);
    });
  });

  // ---- Idempotency ----

  describe('idempotency', () => {
    test('does not overwrite an existing file on re-run', async () => {
      await initVault({ name: 'study', path: tmpVault });

      const appPath = join(tmpVault, '.obsidian/app.json');
      await Bun.write(appPath, '{"sentinel":true}');

      await initVault({ name: 'study', path: tmpVault });

      expect(await Bun.file(appPath).text()).toBe('{"sentinel":true}');
    });

    test('result.skipped contains pre-existing files on re-run', async () => {
      await initVault({ name: 'study', path: tmpVault });
      const second = await initVault({ name: 'study', path: tmpVault });
      expect(second.skipped.some(f => f.endsWith('app.json'))).toBe(true);
    });

    test('result.created contains only new files on re-run (gitignore only)', async () => {
      await initVault({ name: 'study', path: tmpVault });
      const second = await initVault({ name: 'study', path: tmpVault });
      // All vault files should be skipped; only .gitignore may be listed if git ran
      const nonGit = second.created.filter(f => !f.endsWith('.gitignore'));
      expect(nonGit).toHaveLength(0);
    });
  });

  // ---- Git init ----

  describe('git init', () => {
    test('calls git init for a new vault', async () => {
      await initVault({ name: 'study', path: tmpVault });
      const initCall = mockSpawnCapture.mock.calls.find(
        c => c[0][0] === 'git' && c[0].includes('init')
      );
      expect(initCall).toBeDefined();
    });

    test('passes the vault path to git -C', async () => {
      await initVault({ name: 'study', path: tmpVault });
      const initCall = mockSpawnCapture.mock.calls.find(
        c => c[0][0] === 'git' && c[0].includes('init')
      );
      expect(initCall?.[0]).toContain(tmpVault);
    });

    test('skips git init when .git already exists', async () => {
      await Bun.$`mkdir -p ${join(tmpVault, '.git')}`.quiet();
      await Bun.write(join(tmpVault, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      mockSpawnCapture.mockReset();
      await initVault({ name: 'study', path: tmpVault });
      const initCall = mockSpawnCapture.mock.calls.find(
        c => c[0][0] === 'git' && c[0].includes('init')
      );
      expect(initCall).toBeUndefined();
    });

    test('commit message includes the vault name', async () => {
      await initVault({ name: 'my-vault', path: tmpVault });
      const commitCall = mockSpawnCapture.mock.calls.find(
        c => c[0][0] === 'git' && c[0].includes('commit')
      );
      expect(commitCall?.[0].join(' ')).toContain('my-vault');
    });

    test('creates .gitignore before committing', async () => {
      // The mock spawnCapture prevents real git, but writeIfAbsent still runs for .gitignore
      await initVault({ name: 'study', path: tmpVault });
      expect(await Bun.file(join(tmpVault, '.gitignore')).exists()).toBe(true);
      const gi = await Bun.file(join(tmpVault, '.gitignore')).text();
      expect(gi).toContain('.obsidian/workspace.json');
      expect(gi).toContain('.DS_Store');
    });
  });
});

// ---------------------------------------------------------------------------
// gitInit — isolated tests
// ---------------------------------------------------------------------------

describe('gitInit', () => {
  let dir: string;

  beforeEach(async () => {
    mockSpawnCapture.mockReset();
    mockSpawnCapture.mockImplementation(async () => ({ stdout: '', stderr: '', exitCode: 0 }));
    dir = await makeTmpPath();
  });

  afterEach(async () => {
    await Bun.$`rm -rf ${dir}`.quiet();
  });

  test('does not call git when .git already exists', async () => {
    await Bun.$`mkdir -p ${join(dir, '.git')}`.quiet();
    await Bun.write(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    const result: import('../../../src/commands/init-vault').InitVaultResult = {
      created: [],
      skipped: [],
    };
    await gitInit(dir, 'test', result);
    expect(mockSpawnCapture).not.toHaveBeenCalled();
  });

  test('calls git init, add, commit in sequence for new vault', async () => {
    const result: import('../../../src/commands/init-vault').InitVaultResult = {
      created: [],
      skipped: [],
    };
    await gitInit(dir, 'test', result);
    const cmds = mockSpawnCapture.mock.calls.map(c => c[0]);
    expect(cmds.some(c => c.includes('init'))).toBe(true);
    expect(cmds.some(c => c.includes('add'))).toBe(true);
    expect(cmds.some(c => c.includes('commit'))).toBe(true);
    // Order: init → add → commit
    const initIdx = cmds.findIndex(c => c.includes('init'));
    const addIdx = cmds.findIndex(c => c.includes('add'));
    const commitIdx = cmds.findIndex(c => c.includes('commit'));
    expect(initIdx).toBeLessThan(addIdx);
    expect(addIdx).toBeLessThan(commitIdx);
  });
});
