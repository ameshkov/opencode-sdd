/**
 * Tests for the dual plugin entry point.
 *
 * V1 calls `server(input)` and consumes the returned hooks; V2 calls
 * `setup(ctx)` and ignores `server`. These tests pin both dispatch paths and
 * the defensive guard between them.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '@opencode-ai/plugin';
import sddPlugin from './index.js';
import { pluginInput, withCommandsDir } from '../test/plugin-helpers.js';
import { createV2ContextStub } from '../test/v2-context.js';

describe('dual plugin entry', () => {
  it('exposes the V2 id and both host entry points', () => {
    expect(sddPlugin.id).toBe('opencode-sdd');
    expect(sddPlugin.server).toBeTypeOf('function');
    expect(sddPlugin.setup).toBeTypeOf('function');
  });

  it('serves V1: server() logs and returns hooks', async () => {
    const input = pluginInput();

    const hooks = await sddPlugin.server(input);

    expect(hooks.config).toBeTypeOf('function');
    expect(hooks.tool?.['sdd-command']).toBeDefined();
    expect(vi.mocked(input.client.app.log)).toHaveBeenCalledWith({
      body: {
        service: 'opencode-sdd',
        level: 'info',
        message: 'plugin loading',
      },
    });
  });

  it('serves V1: the returned config hook registers commands', async () => {
    await withCommandsDir(async () => {
      const hooks = await sddPlugin.server(pluginInput());
      const config: Config = {};
      await hooks.config?.(config);

      expect(config.command?.['prd-write']).toBeDefined();
      expect(config.command?.['prd-write']?.template).toContain('$ARGUMENTS');
    });
  });

  it('serves V2: setup() registers the surface on a V2 context', async () => {
    await withCommandsDir(async () => {
      const stub = createV2ContextStub();
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await sddPlugin.setup(stub.ctx);

        expect(stub.commands.has('prd-write')).toBe(true);
        expect(stub.tools.has('sdd-command')).toBe(true);
        expect(error.mock.calls.some((call) => String(call[0]).includes('plugin loading'))).toBe(
          true,
        );
      } finally {
        error.mockRestore();
      }
    });
  });

  it('serves V2: setup() ignores a context without V2 editor transforms', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(sddPlugin.setup(null as never)).resolves.toBeUndefined();
      await expect(sddPlugin.setup({} as never)).resolves.toBeUndefined();
      await expect(
        sddPlugin.setup({ agent: {}, command: {}, tool: {} } as never),
      ).resolves.toBeUndefined();
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('serves V2: setup() never throws when registration fails', async () => {
    const stub = createV2ContextStub({ failAgentTransform: new Error('agent transform down') });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(sddPlugin.setup(stub.ctx)).resolves.toBeUndefined();
      expect(error.mock.calls.some((call) => String(call[0]).includes('failed to register'))).toBe(
        true,
      );
    } finally {
      error.mockRestore();
    }
  });
});
