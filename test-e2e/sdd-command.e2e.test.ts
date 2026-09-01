/**
 * E2E: the `sdd-command` tool is registered but globally denied through
 * `config.permission['sdd-command'] = 'deny'`. Earlier releases used
 * `config.tools['sdd-command'] = false`, which opencode ignores for custom
 * (plugin-registered) tool names — the deny had no runtime effect. With the
 * plugin loaded:
 *
 *   - the merged config carries the deny rule (and no `tools` write), and
 *   - an agent without a per-agent allow — `sdd-explore`, a read-only
 *     researcher (the orchestrator role is played by whichever agent runs
 *     `prd-auto-implement`, and none of those carry a per-agent allow) —
 *     cannot actually run `sdd-command`: a scripted call produces no
 *     `Loaded command` output. The worker positive path, where a per-agent
 *     `sdd-command: allow` beats the global deny, is covered by the worker
 *     e2e suite (`sdd-command-worker.e2e.test.ts`).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OpencodeClient, Part, ToolPart } from '@opencode-ai/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createSession,
  mockProviderConfig,
  pluginConfig,
  startOpencodeServer,
  type OpencodeServerHandle,
} from './harness.js';
import { createMockLlm, type MockLlmState } from './mock-server.js';
import { sddCommandScenario } from './scenarios.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length > 0) {
    const fn = cleanup.pop();
    if (fn) {
      try {
        fn();
      } catch {
        /* best-effort */
      }
    }
  }
});

function tempProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-e2e-deny-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function sessionParts(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
): Promise<Part[]> {
  const res = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  });
  return (res.data ?? []).flatMap((message: { parts: Part[] }) => message.parts);
}

function sddCommandParts(parts: Part[]): ToolPart[] {
  return parts.filter(
    (part): part is ToolPart => part.type === 'tool' && part.tool === 'sdd-command',
  );
}

describe('sdd-command tool e2e: global deny', () => {
  let server: OpencodeServerHandle;

  beforeAll(async () => {
    server = await startOpencodeServer(pluginConfig());
  });

  afterAll(() => {
    server?.close();
  });

  it('denies sdd-command via permission in the live merged config, without touching tools', async () => {
    const res = await server.client.config.get();
    expect(res.error, `config.get() errored: ${JSON.stringify(res.error)}`).toBeUndefined();
    expect(res.data).toBeDefined();
    const config = res.data ?? {};
    const permission = config.permission as Record<string, unknown> | undefined;
    expect(permission?.['sdd-command'], 'permission["sdd-command"] must be denied').toBe('deny');
    const tools = config.tools as Record<string, boolean> | undefined;
    expect(
      tools?.['sdd-command'],
      'the deprecated tools field must not be written',
    ).toBeUndefined();
  });
});

describe('sdd-command tool e2e: deny at runtime', () => {
  let server: OpencodeServerHandle;
  let mock: MockLlmState;

  beforeAll(async () => {
    mock = await createMockLlm([]);
    server = await startOpencodeServer(pluginConfig(mockProviderConfig(`${mock.url}/v1`)));
  });

  afterAll(() => {
    server?.close();
    mock?.close();
  });

  it('lets an agent without a per-agent allow run a scripted sdd-command call without loading the command', async () => {
    const directory = tempProjectDir();
    mock.reset(sddCommandScenario('prd-validate'));

    const client = server.client;
    const session = await createSession(client, directory);
    await client.session.prompt({
      path: { id: session.id },
      body: {
        agent: 'sdd-explore',
        parts: [{ type: 'text', text: 'load the validate stage' }],
      },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    const sddParts = sddCommandParts(parts);
    expect(sddParts.length, 'the tool part may be absent or denied, but must not succeed').toBe(0);
  });

  it('runs the same scripted call as the worker, proving the deny is per-agent', async () => {
    const directory = tempProjectDir();
    mock.reset(sddCommandScenario('prd-validate'));

    const client = server.client;
    const session = await createSession(client, directory);
    await client.session.prompt({
      path: { id: session.id },
      body: {
        agent: 'sdd-planner',
        parts: [{ type: 'text', text: 'load the validate stage' }],
      },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    const outputs = sddCommandParts(parts).filter((p) => p.state.status === 'completed');
    expect(outputs.length, 'the worker must still load the command').toBeGreaterThanOrEqual(1);
    const output = (outputs[0]?.state as { output?: unknown }).output;
    expect(typeof output).toBe('string');
    expect(String(output)).toContain('Loaded command "prd-validate" from ');
  });
});
