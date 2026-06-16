import { describe, expect, it, vi } from 'vitest';
import type { Config, PluginInput } from '@opencode-ai/plugin';
import sddPlugin from './index.js';
import { stubClient } from '../test/stub-client.js';

/** Builds a {@link PluginInput} with a stubbed SDK client for logging. */
function pluginInput(): PluginInput {
  return { client: stubClient() } as unknown as PluginInput;
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

  it('registers the sdd-orchestrator agent as a subagent', async () => {
    const hooks = await sddPlugin(pluginInput());
    const config: Config = {};

    await hooks.config?.(config);

    const agent = config.agent?.['sdd-orchestrator'];
    expect(agent).toBeDefined();
    expect(agent?.mode).toBe('subagent');
    expect(typeof agent?.prompt).toBe('string');
    expect(agent?.prompt?.length).toBeGreaterThan(0);
  });

  it('registers the sdd-prd-write command with a template', async () => {
    const hooks = await sddPlugin(pluginInput());
    const config: Config = {};

    await hooks.config?.(config);

    const command = config.command?.['sdd-prd-write'];
    expect(command).toBeDefined();
    expect(typeof command?.template).toBe('string');
    expect(command?.template.length).toBeGreaterThan(0);
  });

  it('preserves existing agents and commands', async () => {
    const hooks = await sddPlugin(pluginInput());
    const config: Config = {
      agent: { build: { description: 'existing build agent' } },
      command: { deploy: { template: 'existing deploy template' } },
    };

    await hooks.config?.(config);

    expect(config.agent?.['build']).toBeDefined();
    expect(config.agent?.['sdd-orchestrator']).toBeDefined();
    expect(config.command?.['deploy']).toBeDefined();
    expect(config.command?.['sdd-prd-write']).toBeDefined();
  });

  it('logs the registered surface when the config hook runs', async () => {
    const input = pluginInput();
    const hooks = await sddPlugin(input);
    const config: Config = {};

    await hooks.config?.(config);

    const messages = vi
      .mocked(input.client.app.log)
      .mock.calls.map((call) => call[0]?.body?.message);
    expect(messages).toContain('registering SDD surface');
    expect(messages).toContain('SDD surface registered');
    expect(messages).toContain('registered agent "sdd-orchestrator"');
  });

  it('logs an error instead of throwing when registration fails', async () => {
    const input = pluginInput();
    const hooks = await sddPlugin(input);

    await expect(hooks.config?.(null as unknown as Config)).resolves.toBeUndefined();

    const errorCalls = vi
      .mocked(input.client.app.log)
      .mock.calls.filter((call) => call[0]?.body?.level === 'error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.[0]?.body?.message).toBe('failed to register SDD surface');
  });
});
