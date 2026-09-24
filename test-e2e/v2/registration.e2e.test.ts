/**
 * V2 in-process registration surface: the real plugin object passed through
 * `OpenCode.create({ plugins })` must register the same SDD agents the V1 lane
 * sees — six hidden subagents with mapped permission rules and a global
 * `sdd-command` deny on non-SDD agents.
 *
 * Command registration is asserted by the loader smoke (the real binary logs
 * the registered count) and by `command.e2e.test.ts` (dispatch behavior),
 * because the V2 public `command.list` API does not expose host-wide plugin
 * commands.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockLlm, type MockLlmState } from '../shared/mock-server.js';
import {
  createV2Session,
  startV2Host,
  v2MockConfig,
  type V2Client,
  type V2HostHandle,
} from './harness.js';

/** Every agent shipped in `src/assets/agents`. */
const SHIPPED_AGENTS = [
  'sdd-coder',
  'sdd-explore',
  'sdd-plan-reviewer',
  'sdd-planner',
  'sdd-reviewer',
  'sdd-validator',
] as const;

/** A V2 permission rule as returned by the agent API. */
interface V2AgentRule {
  readonly action: string;
  readonly resource: string;
  readonly effect: string;
}

/** The agent shape the assertions read. */
interface V2AgentInfo {
  readonly id: string;
  readonly mode?: string;
  readonly hidden?: boolean;
  readonly system?: string;
  readonly permissions: V2AgentRule[];
}

describe('V2 in-process registration', () => {
  let host: V2HostHandle;
  let client: V2Client;
  let mock: MockLlmState;
  let projectDir: string;

  beforeAll(async () => {
    // The location's instance (and with it plugin setup) only materializes
    // when the configured provider is reachable, so a live mock is required
    // even though no model call is made.
    mock = await createMockLlm([]);
    host = await startV2Host(v2MockConfig(`${mock.url}/v1`));
    client = host.client;
    // V2 registers plugins when a location boots; creating a session boots the
    // temp project's location (and runs the plugin's setup).
    projectDir = mkdtempSync(join(tmpdir(), 'sdd-e2e-v2-reg-'));
    await createV2Session(client, projectDir);
    // Kick off instance construction; the plugin's setup runs as part of it.
    await client.command.list({ location: { directory: projectDir } });
  });

  afterAll(async () => {
    await host.close();
    mock.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  /**
   * Fetch one agent's full info for the booted project location.
   *
   * Location instances are constructed asynchronously after the first
   * capability-dependent call, so this polls until the plugin's registrations
   * are visible instead of racing the construction.
   */
  async function getAgent(id: string): Promise<V2AgentInfo> {
    const deadline = Date.now() + 10_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const response = (await client.agent.get({ agentID: id, directory: projectDir })) as {
          data: V2AgentInfo;
        };
        return response.data;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw lastError;
  }

  it('registers every shipped agent as a hidden subagent with a system prompt', async () => {
    for (const name of SHIPPED_AGENTS) {
      const agent = await getAgent(name);
      expect(agent.mode, `agent ${name} mode`).toBe('subagent');
      expect(agent.hidden, `agent ${name} hidden`).toBe(true);
      expect(agent.system ?? '', `agent ${name} system`).not.toBe('');
    }
  });

  it('maps frontmatter permissions onto V2 rules (bash -> shell, task -> subagent)', async () => {
    const planner = await getAgent('sdd-planner');

    expect(planner.permissions).toEqual(
      expect.arrayContaining([
        { action: 'sdd-command', resource: '*', effect: 'allow' },
        { action: 'shell', resource: '*', effect: 'allow' },
        { action: 'subagent', resource: '*', effect: 'deny' },
        { action: 'subagent', resource: 'sdd-explore', effect: 'allow' },
        {
          action: 'external_directory',
          resource: expect.stringMatching(/assets\/commands\/templates\/\*$/),
          effect: 'allow',
        },
      ]),
    );
  });

  it('denies sdd-command on non-SDD agents', async () => {
    const build = await getAgent('build');

    expect(build.permissions).toEqual(
      expect.arrayContaining([{ action: 'sdd-command', resource: '*', effect: 'deny' }]),
    );
  });
});
