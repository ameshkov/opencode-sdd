import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Config, PluginInput } from '@opencode-ai/plugin';
import sddPlugin from './index.js';
import { stubClient } from '../test/stub-client.js';

/** Builds a {@link PluginInput} with a stubbed SDK client for logging. */
function pluginInput(): PluginInput {
  return { client: stubClient() } as unknown as PluginInput;
}

async function withCommandsDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'entry-'));
  const writeCmd = (name: string, description: string) =>
    writeFile(
      join(dir, `${name}.md`),
      [
        '---',
        `description: ${description}`,
        '---',
        '',
        `Command ${name}. Input: $ARGUMENTS`,
        `@opencode-sdd-templates/${name}/template.md`,
        '',
      ].join('\n'),
    );
  await Promise.all([
    writeCmd('prd-write', 'Write a PRD'),
    writeCmd('prd-to-issues', 'Break a PRD into issues'),
    writeCmd('prd-issue-to-plan', 'Plan a PRD issue'),
    writeCmd('prd-implement-issue', 'Implement a PRD issue'),
    writeCmd('prd-validate-issue', 'Validate a PRD issue'),
    writeCmd('prd-validate', 'Validate the full PRD'),
    writeCmd('sdd-quickspec', 'Produce a quick spec'),
    writeCmd('sdd-implement', 'Implement a quick spec'),
    writeCmd('sdd-validate', 'Validate a quick spec'),
    writeCmd('doc-agents', 'Actualize AGENTS.md'),
    writeCmd('doc-changelog', 'Update CHANGELOG.md'),
    writeCmd('doc-deployment', 'Actualize DEPLOYMENT.md'),
    writeCmd('doc-development', 'Actualize DEVELOPMENT.md'),
    writeCmd('doc-readme', 'Actualize README.md'),
  ]);
  process.env['SDD_COMMANDS_DIR'] = dir;
  try {
    await fn(dir);
  } finally {
    delete process.env['SDD_COMMANDS_DIR'];
    await rm(dir, { recursive: true, force: true });
  }
}

async function withAssetsDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'assets-'));
  await mkdir(join(dir, 'prd-write'), { recursive: true });
  await writeFile(join(dir, 'prd-write', 'prd-template.md'), 'placeholder\n');
  process.env['SDD_ASSETS_DIR'] = dir;
  try {
    await fn(dir);
  } finally {
    delete process.env['SDD_ASSETS_DIR'];
    await rm(dir, { recursive: true, force: true });
  }
}

describe('sdd plugin', () => {
  it('exposes a config hook', async () => {
    const hooks = await sddPlugin(pluginInput());
    expect(hooks.config).toBeTypeOf('function');
  });

  it('logs plugin initialization on load', async () => {
    const input = pluginInput();

    await sddPlugin(input);

    expect(vi.mocked(input.client.app.log)).toHaveBeenCalledWith({
      body: {
        service: 'opencode-sdd',
        level: 'info',
        message: 'plugin loading',
      },
    });
  });

  it('registers prd-write from Markdown and no agent', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin(pluginInput());
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
      const hooks = await sddPlugin(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      for (const name of ['sdd-quickspec', 'sdd-implement', 'sdd-validate']) {
        expect(config.command?.[name]).toBeDefined();
        expect(config.command?.[name]?.template).toContain('$ARGUMENTS');
      }
      expect(config.agent?.['sdd-orchestrator']).toBeUndefined();
    });
  });

  it('registers all six PRD long-flow commands from Markdown', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      const prdCommands = [
        'prd-write',
        'prd-to-issues',
        'prd-issue-to-plan',
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

  it('registers all five documentation-maintenance commands from Markdown', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      const docCommands = [
        'doc-agents',
        'doc-changelog',
        'doc-deployment',
        'doc-development',
        'doc-readme',
      ];
      for (const name of docCommands) {
        expect(config.command?.[name]).toBeDefined();
        expect(config.command?.[name]?.template).toContain('$ARGUMENTS');
      }
    });
  });

  it('preserves existing user commands and agents', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin(pluginInput());
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
      const hooks = await sddPlugin(input);
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
      const hooks = await sddPlugin(pluginInput());
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
        join(dirB, 'doc-gen.md'),
        ['---', 'description: b', '---', '', 'Body B $ARGUMENTS', ''].join('\n'),
      );

      const hooks = await sddPlugin(pluginInput());

      // First invocation loads dirA.
      process.env['SDD_COMMANDS_DIR'] = dirA;
      const configA: Config = {};
      await hooks.config?.(configA);
      expect(configA.command?.['prd-write']?.template).toContain('Body A');
      expect(configA.command?.['doc-gen']).toBeUndefined();

      // Second invocation loads dirB — proving the env var is read per call.
      process.env['SDD_COMMANDS_DIR'] = dirB;
      const configB: Config = {};
      await hooks.config?.(configB);
      expect(configB.command?.['doc-gen']?.template).toContain('Body B');
      expect(configB.command?.['prd-write']).toBeUndefined();
    } finally {
      delete process.env['SDD_COMMANDS_DIR'];
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it('does not throw when the assets directory is missing', async () => {
    await withCommandsDir(async () => {
      const input = pluginInput();
      const hooks = await sddPlugin(input);
      process.env['SDD_ASSETS_DIR'] = join(tmpdir(), 'definitely-missing-assets');
      const config: Config = {};

      await expect(hooks.config?.(config)).resolves.toBeUndefined();

      // Commands still register; only the rewrite target is a non-existent
      // dir (the `@opencode-sdd-templates/` token is rewritten to it, which
      // opencode would fail to inline at runtime — but registration itself
      // must not throw).
      expect(config.command?.['prd-write']).toBeDefined();
    });
  });

  it('rewrites the @opencode-sdd-templates token to the absolute assets dir', async () => {
    await withAssetsDir(async (assetsDir) => {
      await withCommandsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
        const config: Config = {};
        await hooks.config?.(config);

        const template = config.command?.['prd-write']?.template;
        expect(template).toContain(`@${assetsDir}/prd-write/template.md`);
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
      await withAssetsDir(async () => {
        const hooks = await sddPlugin(pluginInput());
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
    const hooks = await sddPlugin(input);

    await expect(hooks.config?.(null as unknown as Config)).resolves.toBeUndefined();

    const errorCalls = vi
      .mocked(input.client.app.log)
      .mock.calls.filter((call) => call[0]?.body?.level === 'error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.[0]?.body?.message).toBe('failed to register SDD commands');
  });
});
