import { describe, expect, it } from 'vitest';
import type { AgentConfig } from '@opencode-ai/sdk';
import { registerV2Agents } from './agents.js';
import { stubLogger } from '../../../test/plugin-helpers.js';
import { createV2ContextStub } from '../../../test/v2-context.js';

/** Build an agent config map with one SDD worker. */
function agentsWith(config: AgentConfig): Map<string, AgentConfig> {
  return new Map([['sdd-planner', config]]);
}

describe('registerV2Agents', () => {
  it('creates SDD agents with mapped fields and permission rules', async () => {
    const stub = createV2ContextStub();
    const agents = agentsWith({
      description: 'Plans work',
      mode: 'subagent',
      // The frontmatter hidden flag is deliberately not mapped on V2: its
      // subagent tool filters hidden agents out of the model-facing catalog.
      hidden: true,
      prompt: 'Planner prompt',
      permission: {
        'sdd-command': 'allow',
        bash: 'allow',
        task: { '*': 'deny' },
      } as unknown as AgentConfig['permission'],
    });

    await registerV2Agents(stub.ctx, agents, '/opt/templates', stubLogger());

    const planner = stub.agents.get('sdd-planner');
    expect(planner).toMatchObject({
      description: 'Plans work',
      mode: 'subagent',
      hidden: false,
      system: 'Planner prompt',
    });
    expect(planner?.permissions).toEqual([
      { action: 'sdd-command', resource: '*', effect: 'allow' },
      { action: 'shell', resource: '*', effect: 'allow' },
      { action: 'subagent', resource: '*', effect: 'deny' },
      { action: 'external_directory', resource: '/opt/templates/*', effect: 'allow' },
    ]);
  });

  it('appends a global deny rule to non-SDD agents', async () => {
    const stub = createV2ContextStub();

    await registerV2Agents(
      stub.ctx,
      agentsWith({ mode: 'subagent' }),
      '/opt/templates',
      stubLogger(),
    );

    const build = stub.agents.get('build');
    expect(build?.permissions).toEqual([
      { action: '*', resource: '*', effect: 'allow' },
      { action: 'sdd-command', resource: '*', effect: 'deny' },
    ]);
  });

  it('respects a user-set sdd-command rule on a non-SDD agent', async () => {
    const stub = createV2ContextStub();
    stub.agents.set('build', {
      id: 'build',
      name: 'Build',
      mode: 'primary',
      hidden: false,
      permissions: [{ action: 'sdd-command', resource: '*', effect: 'allow' }],
    });

    await registerV2Agents(
      stub.ctx,
      agentsWith({ mode: 'subagent' }),
      '/opt/templates',
      stubLogger(),
    );

    expect(stub.agents.get('build')?.permissions).toEqual([
      { action: 'sdd-command', resource: '*', effect: 'allow' },
    ]);
  });

  it('merges onto an existing agent without duplicating rules', async () => {
    const stub = createV2ContextStub();
    const agents = agentsWith({ description: 'first', mode: 'subagent', prompt: 'one' });

    await registerV2Agents(stub.ctx, agents, '/opt/templates', stubLogger());
    await registerV2Agents(stub.ctx, agents, '/opt/templates', stubLogger());

    const planner = stub.agents.get('sdd-planner');
    expect(planner?.description).toBe('first');
    const grants = planner?.permissions.filter((rule) => rule.action === 'external_directory');
    expect(grants).toHaveLength(1);
  });

  it('logs and swallows a transform failure', async () => {
    const failure = new Error('transform down');
    const stub = createV2ContextStub({ failAgentTransform: failure });
    const logger = stubLogger();

    await expect(
      registerV2Agents(stub.ctx, agentsWith({ mode: 'subagent' }), '/opt/templates', logger),
    ).resolves.toBeUndefined();

    expect(logger.entries.some((entry) => entry.message === 'failed to register SDD agents')).toBe(
      true,
    );
  });
});
