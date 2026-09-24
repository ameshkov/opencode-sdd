import { describe, expect, it } from 'vitest';
import type { CommandConfig } from '../../commands/index.js';
import { registerV2Commands, substituteArguments } from './commands.js';
import { stubLogger } from '../../../test/plugin-helpers.js';
import { createV2ContextStub } from '../../../test/v2-context.js';

/** Build a command map with one fixture command. */
function commandsWith(config: CommandConfig): Map<string, CommandConfig> {
  return new Map([['prd-write', config]]);
}

describe('substituteArguments', () => {
  it('replaces every $ARGUMENTS token', () => {
    expect(substituteArguments('a $ARGUMENTS b $ARGUMENTS', 'X')).toBe('a X b X');
  });

  it('replaces with an empty string when no arguments are given', () => {
    expect(substituteArguments('a $ARGUMENTS b', '')).toBe('a  b');
  });
});

describe('registerV2Commands', () => {
  it('registers commands with rewritten templates', async () => {
    const stub = createV2ContextStub();
    const commands = commandsWith({
      template: 'Body $ARGUMENTS @opencode-sdd-templates/prd-write/prd-template.md',
      description: 'Write a PRD',
    });

    await registerV2Commands(stub.ctx, commands, '/opt/templates', stubLogger());

    const command = stub.commands.get('prd-write');
    expect(command?.description).toBe('Write a PRD');
    expect(command?.execute).toBeTypeOf('function');
  });

  it('dispatches the rewritten template with arguments substituted', async () => {
    const stub = createV2ContextStub();
    const commands = commandsWith({
      template: 'Body $ARGUMENTS @opencode-sdd-templates/prd-write/prd-template.md',
    });
    await registerV2Commands(stub.ctx, commands, '/opt/templates', stubLogger());

    await stub.commands.get('prd-write')?.execute({
      sessionID: 'ses_1',
      prompt: { text: 'fix the login bug' },
    });

    expect(stub.prompts).toEqual([
      {
        sessionID: 'ses_1',
        text: 'Body fix the login bug @/opt/templates/prd-write/prd-template.md',
      },
    ]);
  });

  it('tolerates a missing invocation prompt', async () => {
    const stub = createV2ContextStub();
    await registerV2Commands(
      stub.ctx,
      commandsWith({ template: 'Body $ARGUMENTS' }),
      '/t',
      stubLogger(),
    );

    await stub.commands.get('prd-write')?.execute({ sessionID: 'ses_2' });

    expect(stub.prompts[0]?.text).toBe('Body ');
  });

  it('logs and swallows a prompt failure', async () => {
    const stub = createV2ContextStub({ failPrompt: new Error('prompt down') });
    const logger = stubLogger();
    await registerV2Commands(stub.ctx, commandsWith({ template: 'Body' }), '/t', logger);

    await expect(
      stub.commands.get('prd-write')?.execute({ sessionID: 'ses_3' }),
    ).resolves.toBeUndefined();
    expect(logger.entries.some((entry) => entry.message === 'failed to dispatch SDD command')).toBe(
      true,
    );
  });

  it('logs and swallows a transform failure', async () => {
    const stub = createV2ContextStub({ failCommandTransform: new Error('transform down') });
    const logger = stubLogger();

    await expect(
      registerV2Commands(stub.ctx, commandsWith({ template: 'Body' }), '/t', logger),
    ).resolves.toBeUndefined();
    expect(
      logger.entries.some((entry) => entry.message === 'failed to register SDD commands'),
    ).toBe(true);
  });
});
