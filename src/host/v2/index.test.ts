import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerV2 } from './index.js';
import { stubLogger } from '../../../test/plugin-helpers.js';
import { createV2ContextStub } from '../../../test/v2-context.js';

/** Create a commands dir with a single fixture command. */
async function withV2CommandsDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'v2-entry-'));
  await writeFile(
    join(dir, 'prd-write.md'),
    ['---', 'description: write', '---', '', 'Body $ARGUMENTS', ''].join('\n'),
  );
  process.env['SDD_COMMANDS_DIR'] = dir;
  process.env['SDD_AGENTS_DIR'] = join(tmpdir(), 'definitely-missing-agents');
  try {
    await fn(dir);
  } finally {
    delete process.env['SDD_COMMANDS_DIR'];
    delete process.env['SDD_AGENTS_DIR'];
    await rm(dir, { recursive: true, force: true });
  }
}

describe('registerV2', () => {
  afterEach(() => {
    delete process.env['SDD_TEMPLATES_DIR'];
  });

  it('registers agents, commands, and the tool from one surface', async () => {
    await withV2CommandsDir(async () => {
      const stub = createV2ContextStub();

      await registerV2(stub.ctx, stubLogger());

      expect(stub.commands.has('prd-write')).toBe(true);
      expect(stub.tools.has('sdd-command')).toBe(true);
      expect(stub.transformCalls).toEqual({ agent: 1, command: 1, tool: 1 });
    });
  });

  it('keeps registering later steps when an earlier step fails', async () => {
    await withV2CommandsDir(async () => {
      const stub = createV2ContextStub({ failAgentTransform: new Error('agents down') });

      await registerV2(stub.ctx, stubLogger());

      expect(stub.commands.has('prd-write')).toBe(true);
      expect(stub.tools.has('sdd-command')).toBe(true);
    });
  });
});
