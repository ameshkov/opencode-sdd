import { describe, expect, it } from 'vitest';
import type { Config, PluginInput } from '@opencode-ai/plugin';
import sddPlugin from './index.js';

describe('sdd plugin', () => {
  it('exposes a config hook', async () => {
    const hooks = await sddPlugin({} as PluginInput);
    expect(hooks.config).toBeTypeOf('function');
  });

  it('registers the sdd-orchestrator agent as a subagent', async () => {
    const hooks = await sddPlugin({} as PluginInput);
    const config: Config = {};

    await hooks.config?.(config);

    const agent = config.agent?.['sdd-orchestrator'];
    expect(agent).toBeDefined();
    expect(agent?.mode).toBe('subagent');
    expect(typeof agent?.prompt).toBe('string');
    expect(agent?.prompt?.length).toBeGreaterThan(0);
  });

  it('registers the sdd-prd-write command with a template', async () => {
    const hooks = await sddPlugin({} as PluginInput);
    const config: Config = {};

    await hooks.config?.(config);

    const command = config.command?.['sdd-prd-write'];
    expect(command).toBeDefined();
    expect(typeof command?.template).toBe('string');
    expect(command?.template.length).toBeGreaterThan(0);
  });

  it('preserves existing agents and commands', async () => {
    const hooks = await sddPlugin({} as PluginInput);
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
});
