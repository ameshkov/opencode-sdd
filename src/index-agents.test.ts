import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Config } from '@opencode-ai/plugin';
import sddPlugin from './index.js';
import { pluginInput, withCommandsDir } from '../test/plugin-helpers.js';

/**
 * Create a temp agents directory with a single `sdd-explore` fixture, set
 * `SDD_AGENTS_DIR` for the callback's duration, then clean up.
 *
 * @param fn - Test body that receives the agents directory path.
 */
async function withAgentsDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'agents-'));
  const writeAgent = (name: string, mode: string) =>
    writeFile(
      join(dir, `${name}.md`),
      [
        '---',
        `description: ${name}`,
        `mode: ${mode}`,
        'hidden: true',
        '---',
        '',
        `${name} prompt`,
        '',
      ].join('\n'),
    );
  await Promise.all([writeAgent('sdd-explore', 'subagent')]);
  process.env['SDD_AGENTS_DIR'] = dir;
  try {
    await fn(dir);
  } finally {
    delete process.env['SDD_AGENTS_DIR'];
    await rm(dir, { recursive: true, force: true });
  }
}

describe('sdd plugin agent registration', () => {
  it('registers sdd-explore from Markdown', async () => {
    await withCommandsDir(async () => {
      await withAgentsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {};
        await hooks.config?.(config);

        const explore = config.agent?.['sdd-explore'];
        expect(explore).toBeDefined();
        expect(explore?.mode).toBe('subagent');
        expect(explore?.['hidden']).toBe(true);
      });
    });
  });

  it('preserves existing user agents via spread-merge', async () => {
    await withCommandsDir(async () => {
      await withAgentsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {
          agent: { 'user-agent': { description: 'mine' } },
        };
        await hooks.config?.(config);

        expect(config.agent?.['user-agent']).toBeDefined();
        expect(config.agent?.['sdd-explore']).toBeDefined();
      });
    });
  });

  it('preserves a user-set model when merging onto a same-named SDD agent', async () => {
    await withCommandsDir(async () => {
      await withAgentsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        // A user pins sdd-explore to a model in opencode.json before the
        // plugin registers its own definition for the same agent name.
        const config: Config = {
          agent: { 'sdd-explore': { model: 'mock/explore-model' } },
        };
        await hooks.config?.(config);

        const explore = config.agent?.['sdd-explore'];
        expect(explore).toBeDefined();
        // Plugin-defined fields still land.
        expect(explore?.mode).toBe('subagent');
        expect(explore?.['hidden']).toBe(true);
        // User-only `model` survives the merge instead of being clobbered.
        expect(explore?.model).toBe('mock/explore-model');
      });
    });
  });

  it('does not throw when the agents directory is missing', async () => {
    await withCommandsDir(async () => {
      process.env['SDD_AGENTS_DIR'] = join(tmpdir(), 'definitely-missing-agents');
      try {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {};
        await expect(hooks.config?.(config)).resolves.toBeUndefined();
        expect(config.agent?.['sdd-explore']).toBeUndefined();
      } finally {
        delete process.env['SDD_AGENTS_DIR'];
      }
    });
  });

  it('does not throw when a single agent file is malformed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agents-bad-'));
    try {
      await writeFile(
        join(dir, 'broken.md'),
        ['---', 'mode: subagent', '---', '', 'no description', ''].join('\n'),
      );
      process.env['SDD_AGENTS_DIR'] = dir;
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {};
        await expect(hooks.config?.(config)).resolves.toBeUndefined();
        expect(config.agent?.['broken']).toBeUndefined();
      });
    } finally {
      delete process.env['SDD_AGENTS_DIR'];
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('registers a worker agent with its nested task allowlist and sdd-command allowed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agents-worker-'));
    try {
      await writeFile(
        join(dir, 'sdd-planner.md'),
        [
          '---',
          'description: Planner',
          'mode: subagent',
          'hidden: true',
          'tools:',
          '  sdd-command: true',
          'permission:',
          '  task:',
          '    "*": deny',
          '    sdd-explore: allow',
          '---',
          '',
          'load stage instructions via sdd-command',
          '',
        ].join('\n'),
      );
      await withCommandsDir(async () => {
        process.env['SDD_AGENTS_DIR'] = dir;
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {};
        await hooks.config?.(config);

        const planner = config.agent?.['sdd-planner'];
        expect(planner).toBeDefined();
        expect(planner?.mode).toBe('subagent');
        expect(planner?.['hidden']).toBe(true);
        expect(planner?.tools?.['sdd-command']).toBe(true);
        const plannerPerm = planner?.permission as Record<string, unknown> | undefined;
        const task = plannerPerm?.task;
        expect(task).toEqual({
          '*': 'deny',
          'sdd-explore': 'allow',
        });
        expect(config.tools?.['sdd-command']).toBe(false);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('registers the bundled sdd-build as a primary agent with edit:ask, sdd-* task allowlist, and sdd-command denied', async () => {
    // Neutralise command loading; leave SDD_AGENTS_DIR unset so the real
    // bundled agents directory is loaded.
    process.env['SDD_COMMANDS_DIR'] = join(tmpdir(), 'definitely-missing-cmds');
    try {
      delete process.env['SDD_AGENTS_DIR'];
      const hooks = await sddPlugin(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      const build = config.agent?.['sdd-build'];
      expect(build).toBeDefined();
      expect(build?.mode).toBe('primary');
      expect(build?.['hidden']).not.toBe(true);
      const buildPerm = build?.permission as Record<string, unknown> | undefined;
      // sdd-build does not override the global sdd-command deny.
      expect(build?.tools?.['sdd-command']).toBeUndefined();
      expect(build?.permission?.edit).toBe('ask');
      expect(buildPerm?.read).toBe('allow');
      expect(buildPerm?.glob).toBe('allow');
      expect(buildPerm?.grep).toBe('allow');
      expect(buildPerm?.question).toBe('allow');
      const task = buildPerm?.task;
      expect(task).toEqual({
        '*': 'deny',
        'sdd-*': 'allow',
      });
      // Global deny applies to sdd-build.
      expect(config.tools?.['sdd-command']).toBe(false);
    } finally {
      delete process.env['SDD_COMMANDS_DIR'];
    }
  });
});

describe('sdd plugin tool registration', () => {
  it('exposes the sdd-command tool definition on the tool hook', async () => {
    const hooks = await sddPlugin(pluginInput());
    expect(hooks.tool?.['sdd-command']).toBeDefined();
    expect(hooks.tool?.['sdd-command']?.description).toContain('prd-validate');
  });

  it('sets config.tools["sdd-command"] to false after the config hook', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      expect(config.tools?.['sdd-command']).toBe(false);
    });
  });

  it('preserves an existing user tools entry via spread-merge', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin(pluginInput());
      const config: Config = { tools: { 'user-tool': true } };
      await hooks.config?.(config);

      expect(config.tools?.['user-tool']).toBe(true);
      expect(config.tools?.['sdd-command']).toBe(false);
    });
  });

  it('does not throw when setting the global deny if config.tools is absent', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin(pluginInput());
      const config: Config = {};
      await expect(hooks.config?.(config)).resolves.toBeUndefined();
      expect(config.tools?.['sdd-command']).toBe(false);
    });
  });
});
