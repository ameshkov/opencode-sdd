import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Config, Hooks, PluginInput } from '@opencode-ai/plugin';
import { createV1Hooks } from './index.js';
import { createV1Logger } from './logger.js';
import { pluginInput, withCommandsDir } from '../../../test/plugin-helpers.js';

/** Build the V1 hooks with a logger bound to `input`. */
function hooksFrom(input: PluginInput): Hooks {
  return createV1Hooks(createV1Logger(input.client));
}

async function withTemplatesDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'templates-'));
  await mkdir(join(dir, 'prd-write'), { recursive: true });
  await writeFile(join(dir, 'prd-write', 'prd-template.md'), 'placeholder\n');
  process.env['SDD_TEMPLATES_DIR'] = dir;
  try {
    await fn(dir);
  } finally {
    delete process.env['SDD_TEMPLATES_DIR'];
    await rm(dir, { recursive: true, force: true });
  }
}

describe('sdd plugin', () => {
  it('exposes a config hook', async () => {
    const hooks = hooksFrom(pluginInput());
    expect(hooks.config).toBeTypeOf('function');
  });

  it('registers prd-write from Markdown and no agent', async () => {
    await withCommandsDir(async () => {
      const hooks = hooksFrom(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      const command = config.command?.['prd-write'];
      expect(command).toBeDefined();
      expect(command?.template).toContain('$ARGUMENTS');
      expect(config.agent?.['sdd-orchestrator']).toBeUndefined();
    });
  });

  it('registers the sdd short-flow commands from Markdown', async () => {
    await withCommandsDir(async () => {
      const hooks = hooksFrom(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      for (const name of ['sdd-spec', 'sdd-implement', 'sdd-validate']) {
        expect(config.command?.[name]).toBeDefined();
        expect(config.command?.[name]?.template).toContain('$ARGUMENTS');
      }
      expect(config.agent?.['sdd-orchestrator']).toBeUndefined();
    });
  });

  it('registers all seven PRD long-flow commands from Markdown', async () => {
    await withCommandsDir(async () => {
      const hooks = hooksFrom(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      const prdCommands = [
        'prd-write',
        'prd-to-issues',
        'prd-issue-to-plan',
        'prd-review-plan',
        'prd-implement-issue',
        'prd-validate-issue',
        'prd-validate',
      ];
      for (const name of prdCommands) {
        expect(config.command?.[name]).toBeDefined();
        expect(config.command?.[name]?.template).toContain('$ARGUMENTS');
      }
    });
  });

  it('preserves existing user commands and agents', async () => {
    await withCommandsDir(async () => {
      const hooks = hooksFrom(pluginInput());
      const config: Config = {
        agent: { 'user-agent': { description: 'existing' } },
        command: { 'user-cmd': { template: 'existing template' } },
      };
      await hooks.config?.(config);

      expect(config.agent?.['user-agent']).toBeDefined();
      expect(config.command?.['user-cmd']).toBeDefined();
      expect(config.command?.['prd-write']).toBeDefined();
    });
  });

  it('logs a collision and still registers the command', async () => {
    await withCommandsDir(async () => {
      const input = pluginInput();
      const hooks = hooksFrom(input);
      const config: Config = {
        command: { 'prd-write': { template: 'user owned' } },
      };
      await hooks.config?.(config);

      expect(
        vi.mocked(input.client.app.log).mock.calls.some((call) => {
          const body = (call[0] as { body?: { message?: string } }).body;
          return body?.message === 'command name collision, overwriting';
        }),
      ).toBe(true);
      expect(config.command?.['prd-write']?.template).toContain('$ARGUMENTS');
    });
  });

  it('does not throw when the commands directory is missing', async () => {
    process.env['SDD_COMMANDS_DIR'] = join(tmpdir(), 'definitely-missing');
    try {
      const hooks = hooksFrom(pluginInput());
      const config: Config = {
        command: { 'user-cmd': { template: 'keep me' } },
      };
      await expect(hooks.config?.(config)).resolves.toBeUndefined();
      expect(config.command?.['user-cmd']).toBeDefined();
      expect(config.command?.['prd-write']).toBeUndefined();
    } finally {
      delete process.env['SDD_COMMANDS_DIR'];
    }
  });

  it('reads SDD_COMMANDS_DIR on each invocation of the hook', async () => {
    const dirA = await mkdtemp(join(tmpdir(), 'entry-a-'));
    const dirB = await mkdtemp(join(tmpdir(), 'entry-b-'));
    try {
      await writeFile(
        join(dirA, 'prd-write.md'),
        ['---', 'description: a', '---', '', 'Body A $ARGUMENTS', ''].join('\n'),
      );
      await writeFile(
        join(dirB, 'sample-cmd.md'),
        ['---', 'description: b', '---', '', 'Body B $ARGUMENTS', ''].join('\n'),
      );

      const hooks = hooksFrom(pluginInput());

      // First invocation loads dirA.
      process.env['SDD_COMMANDS_DIR'] = dirA;
      const configA: Config = {};
      await hooks.config?.(configA);
      expect(configA.command?.['prd-write']?.template).toContain('Body A');
      expect(configA.command?.['sample-cmd']).toBeUndefined();

      // Second invocation loads dirB — proving the env var is read per call.
      process.env['SDD_COMMANDS_DIR'] = dirB;
      const configB: Config = {};
      await hooks.config?.(configB);
      expect(configB.command?.['sample-cmd']?.template).toContain('Body B');
      expect(configB.command?.['prd-write']).toBeUndefined();
    } finally {
      delete process.env['SDD_COMMANDS_DIR'];
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it('does not throw when the templates directory is missing', async () => {
    await withCommandsDir(async () => {
      const input = pluginInput();
      const hooks = hooksFrom(input);
      process.env['SDD_TEMPLATES_DIR'] = join(tmpdir(), 'definitely-missing-assets');
      const config: Config = {};

      await expect(hooks.config?.(config)).resolves.toBeUndefined();

      // Commands still register; only the rewrite target is a non-existent
      // dir (the `@opencode-sdd-templates/` token is rewritten to it, which
      // opencode would fail to inline at runtime — but registration itself
      // must not throw).
      expect(config.command?.['prd-write']).toBeDefined();
    });
  });

  it('rewrites the @opencode-sdd-templates token to the absolute templates dir', async () => {
    await withTemplatesDir(async (templatesDir) => {
      await withCommandsDir(async () => {
        const hooks = hooksFrom(pluginInput());
        const config: Config = {};
        await hooks.config?.(config);

        const template = config.command?.['prd-write']?.template;
        expect(template).toContain(`@${templatesDir}/prd-write/template.md`);
        expect(template).not.toContain('@opencode-sdd-templates/');
      });
    });
  });

  it('leaves a command template with no token unchanged', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'entry-notoken-'));
    try {
      await writeFile(
        join(dir, 'plain.md'),
        ['---', 'description: plain', '---', '', 'No token here $ARGUMENTS', ''].join('\n'),
      );
      process.env['SDD_COMMANDS_DIR'] = dir;
      await withTemplatesDir(async () => {
        const hooks = hooksFrom(pluginInput());
        const config: Config = {};
        await hooks.config?.(config);

        expect(config.command?.['plain']?.template).toContain('No token here $ARGUMENTS');
        expect(config.command?.['plain']?.template).not.toContain('@opencode-sdd-templates');
      });
    } finally {
      delete process.env['SDD_COMMANDS_DIR'];
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('logs an error instead of throwing when registration fails', async () => {
    const input = pluginInput();
    const hooks = hooksFrom(input);

    await expect(hooks.config?.(null as unknown as Config)).resolves.toBeUndefined();

    const errorCalls = vi
      .mocked(input.client.app.log)
      .mock.calls.filter((call) => call[0]?.body?.level === 'error');
    expect(errorCalls).toHaveLength(4);
    const messages = errorCalls.map((call) => call[0]?.body?.message);
    expect(messages).toContain('failed to register SDD commands');
    expect(messages).toContain('failed to register SDD agents');
    expect(messages).toContain('failed to register sdd-command global deny');
    expect(messages).toContain('failed to register bundled templates permission');
  });
});

describe('sdd plugin prd-auto-implement command registration', () => {
  it('registers prd-auto-implement with no agent binding and no subtask flag', async () => {
    // Load the real bundled commands (where prd-auto-implement.md lives) and
    // neutralise agent loading for determinism, mirroring the bundled-agent
    // test's env-isolation pattern (inverted: commands real, agents missing).
    delete process.env['SDD_COMMANDS_DIR'];
    process.env['SDD_AGENTS_DIR'] = join(tmpdir(), 'definitely-missing-agents');
    try {
      const hooks = hooksFrom(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      const command = config.command?.['prd-auto-implement'];
      expect(command).toBeDefined();
      // No agent binding: the orchestrator role is played by whatever agent
      // runs the command, rather than a dedicated `sdd-build` agent.
      expect(command?.agent).toBeUndefined();
      expect(command?.subtask).toBeUndefined();
      // The template is the orchestrator prompt; the body identifies the
      // orchestrator role rather than naming an agent.
      expect(command?.template).toContain('orchestrator');
      expect(command?.template).toContain('sdd-planner');
      // No portable template token to rewrite; the rewriter is a no-op and
      // the template survives unchanged.
      expect(command?.template).not.toContain('@opencode-sdd-templates/');
    } finally {
      delete process.env['SDD_COMMANDS_DIR'];
      delete process.env['SDD_AGENTS_DIR'];
    }
  });

  it('preserves an existing user command via spread-merge alongside prd-auto-implement', async () => {
    delete process.env['SDD_COMMANDS_DIR'];
    process.env['SDD_AGENTS_DIR'] = join(tmpdir(), 'definitely-missing-agents');
    try {
      const hooks = hooksFrom(pluginInput());
      const config: Config = {
        command: { 'user-cmd': { template: 'keep me' } },
      };
      await hooks.config?.(config);

      expect(config.command?.['user-cmd']).toBeDefined();
      expect(config.command?.['prd-auto-implement']).toBeDefined();
    } finally {
      delete process.env['SDD_COMMANDS_DIR'];
      delete process.env['SDD_AGENTS_DIR'];
    }
  });
});
