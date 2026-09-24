import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSurface, createToolCore } from './surface.js';
import { stubLogger } from '../../test/plugin-helpers.js';

/** Env keys the surface resolvers honor. */
const ENV_KEYS = ['SDD_COMMANDS_DIR', 'SDD_AGENTS_DIR', 'SDD_TEMPLATES_DIR'] as const;

/** Restore the SDD directory env vars after each test. */
function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('surface resolvers', () => {
  afterEach(clearEnv);

  it('falls back to bundled asset directories', async () => {
    clearEnv();
    const { dirs } = await buildSurface(stubLogger());

    expect(dirs.commands).toMatch(/assets[/\\]commands$/);
    expect(dirs.templates).toMatch(/assets[/\\]commands[/\\]templates$/);
    expect(dirs.agents).toMatch(/assets[/\\]agents$/);
  });

  it('honors environment overrides', async () => {
    process.env['SDD_COMMANDS_DIR'] = '/tmp/cmds';
    process.env['SDD_AGENTS_DIR'] = '/tmp/agents';
    process.env['SDD_TEMPLATES_DIR'] = '/tmp/templates';

    const { dirs } = await buildSurface(stubLogger());

    expect(dirs).toEqual({
      commands: '/tmp/cmds',
      agents: '/tmp/agents',
      templates: '/tmp/templates',
    });
  });
});

describe('buildSurface', () => {
  afterEach(clearEnv);

  it('loads commands and agents from the resolved directories', async () => {
    const commandsDir = await mkdtemp(join(tmpdir(), 'surface-cmd-'));
    const agentsDir = await mkdtemp(join(tmpdir(), 'surface-agent-'));
    try {
      await writeFile(
        join(commandsDir, 'prd-write.md'),
        ['---', 'description: write', '---', '', 'Body $ARGUMENTS', ''].join('\n'),
      );
      await writeFile(
        join(agentsDir, 'sdd-coder.md'),
        [
          '---',
          'description: coder',
          'mode: subagent',
          'hidden: true',
          '---',
          '',
          'Coder prompt',
          '',
        ].join('\n'),
      );
      process.env['SDD_COMMANDS_DIR'] = commandsDir;
      process.env['SDD_AGENTS_DIR'] = agentsDir;

      const surface = await buildSurface(stubLogger());

      expect(surface.commands.get('prd-write')?.description).toBe('write');
      expect(surface.agents.get('sdd-coder')?.description).toBe('coder');
      expect(surface.tool.description).toContain('Available commands');
    } finally {
      await rm(commandsDir, { recursive: true, force: true });
      await rm(agentsDir, { recursive: true, force: true });
    }
  });

  it('degrades to an empty surface when the directories are missing', async () => {
    process.env['SDD_COMMANDS_DIR'] = join(tmpdir(), 'surface-missing-cmds');
    process.env['SDD_AGENTS_DIR'] = join(tmpdir(), 'surface-missing-agents');

    const surface = await buildSurface(stubLogger());

    expect(surface.commands.size).toBe(0);
    expect(surface.agents.size).toBe(0);
    expect(surface.tool.description).toContain('Available commands');
  });
});

describe('createToolCore', () => {
  afterEach(clearEnv);

  it('reads the commands directory at execute time', async () => {
    const commandsDir = await mkdtemp(join(tmpdir(), 'surface-late-cmd-'));
    const templatesDir = await mkdtemp(join(tmpdir(), 'surface-late-tpl-'));
    try {
      await writeFile(
        join(commandsDir, 'prd-validate.md'),
        ['---', 'description: v', '---', '', 'Late @opencode-sdd-templates/x.md', ''].join('\n'),
      );
      const core = createToolCore();

      process.env['SDD_COMMANDS_DIR'] = commandsDir;
      process.env['SDD_TEMPLATES_DIR'] = templatesDir;
      const output = await core.execute({ command: 'prd-validate' });

      expect(output).toContain('Loaded command "prd-validate"');
      expect(output).toContain(`@${templatesDir}/x.md`);
    } finally {
      await rm(commandsDir, { recursive: true, force: true });
      await rm(templatesDir, { recursive: true, force: true });
    }
  });
});
