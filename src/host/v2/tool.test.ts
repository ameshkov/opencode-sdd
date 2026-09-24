import { describe, expect, it } from 'vitest';
import { registerV2Tool } from './tool.js';
import { stubLogger } from '../../../test/plugin-helpers.js';
import { createV2ContextStub } from '../../../test/v2-context.js';
import type { SddCommandToolCore } from '../../sdd-command/index.js';

/** Build a neutral tool core with a fixed description and schema. */
function coreStub(execute: SddCommandToolCore['execute']): SddCommandToolCore {
  return {
    description: 'Load a command',
    inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
    legacyArgs: { command: { type: 'string', description: 'name' } },
    execute,
  };
}

describe('registerV2Tool', () => {
  it('registers sdd-command directly with the sdd-command permission action', async () => {
    const stub = createV2ContextStub();

    await registerV2Tool(
      stub.ctx,
      coreStub(async () => 'loaded'),
      stubLogger(),
    );

    const tool = stub.tools.get('sdd-command');
    expect(tool?.description).toBe('Load a command');
    expect(tool?.input).toEqual({ type: 'object', properties: { command: { type: 'string' } } });
    expect(tool?.options).toEqual({ codemode: false, permission: 'sdd-command' });
  });

  it('wraps the core result as tool content', async () => {
    const stub = createV2ContextStub();
    await registerV2Tool(
      stub.ctx,
      coreStub(async () => 'loaded body'),
      stubLogger(),
    );

    const result = await stub.tools.get('sdd-command')?.execute({ command: 'prd-validate' }, {});

    expect(result).toEqual({ content: 'loaded body' });
  });

  it('logs and swallows a transform failure', async () => {
    const stub = createV2ContextStub({ failToolTransform: new Error('transform down') });
    const logger = stubLogger();

    await expect(
      registerV2Tool(
        stub.ctx,
        coreStub(async () => 'x'),
        logger,
      ),
    ).resolves.toBeUndefined();
    expect(
      logger.entries.some((entry) => entry.message === 'failed to register sdd-command tool'),
    ).toBe(true);
  });
});
