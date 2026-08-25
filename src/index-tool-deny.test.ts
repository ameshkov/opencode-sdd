/**
 * Unit tests for the global `sdd-command` deny: the plugin gates its custom
 * tool through `config.permission['sdd-command']`, not the deprecated `tools`
 * field, which opencode ignores for plugin-registered tool names.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Config, PluginInput } from '@opencode-ai/plugin';
import sddPlugin from './index.js';
import { permissionRecord, pluginInput, withCommandsDir } from '../test/plugin-helpers.js';

/** True when a log entry at `level` carrying `message` was emitted. */
function loggedWith(input: PluginInput, level: string, message: string): boolean {
  return vi.mocked(input.client.app.log).mock.calls.some((call) => {
    const body = (call[0] as { body?: { level?: string; message?: string } }).body;
    return body?.level === level && body?.message === message;
  });
}

/** Run the config hook against `config` and return the plugin input used. */
async function runConfigHook(config: Config): Promise<PluginInput> {
  const input = pluginInput();
  const hooks = await sddPlugin(input);
  await expect(hooks.config?.(config)).resolves.toBeUndefined();
  return input;
}

describe('sdd plugin sdd-command global deny', () => {
  it('denies sdd-command via permission after the config hook', async () => {
    await withCommandsDir(async () => {
      const config: Config = {};
      await runConfigHook(config);

      expect(permissionRecord(config)?.['sdd-command']).toBe('deny');
    });
  });

  it('never writes the deprecated tools field', async () => {
    await withCommandsDir(async () => {
      const config: Config = {};
      await runConfigHook(config);

      expect(config.tools).toBeUndefined();
    });
  });

  it('preserves existing user permission categories via spread-merge', async () => {
    await withCommandsDir(async () => {
      const config: Config = { permission: { edit: 'allow', bash: 'ask' } };
      await runConfigHook(config);

      const permission = permissionRecord(config);
      expect(permission?.edit).toBe('allow');
      expect(permission?.bash).toBe('ask');
      expect(permission?.['sdd-command']).toBe('deny');
    });
  });

  it('coexists with the bundled templates external_directory grant', async () => {
    await withCommandsDir(async () => {
      const config: Config = {};
      await runConfigHook(config);

      const permission = permissionRecord(config);
      expect(permission?.['sdd-command']).toBe('deny');
      expect(permission?.external_directory).toBeDefined();
    });
  });

  it('leaves an sdd-command permission the user set themselves untouched', async () => {
    await withCommandsDir(async () => {
      const config: Config = {
        permission: { 'sdd-command': 'allow' } as unknown as Config['permission'],
      };
      const input = await runConfigHook(config);

      expect(permissionRecord(config)?.['sdd-command']).toBe('allow');
      expect(
        loggedWith(input, 'debug', 'sdd-command permission already set by user; left untouched'),
      ).toBe(true);
    });
  });

  it('warns and skips when permission is a global "allow" string', async () => {
    await withCommandsDir(async () => {
      const config: Config = { permission: 'allow' as unknown as Config['permission'] };
      const input = await runConfigHook(config);

      // A global string is never rewritten into object form: that would
      // silently change the action of every other tool.
      expect(config.permission).toBe('allow');
      expect(
        loggedWith(input, 'warn', 'cannot deny sdd-command: permission is a global "allow"'),
      ).toBe(true);
    });
  });

  it('is a no-op when permission is a global "deny" string', async () => {
    await withCommandsDir(async () => {
      const config: Config = { permission: 'deny' as unknown as Config['permission'] };
      const input = await runConfigHook(config);

      expect(config.permission).toBe('deny');
      expect(
        loggedWith(input, 'debug', 'permission is a global string; sdd-command already restricted'),
      ).toBe(true);
    });
  });

  it('is a no-op when permission is a global "ask" string', async () => {
    await withCommandsDir(async () => {
      const config: Config = { permission: 'ask' as unknown as Config['permission'] };
      await runConfigHook(config);

      expect(config.permission).toBe('ask');
    });
  });
});
