/**
 * E2E: a hidden SDD worker (`sdd-planner`) actually calls `sdd-command` at
 * runtime and receives the rewritten markdown (success path) or the
 * single-line error string (error path). This is the positive tool-result
 * e2e deferred from Issue 2, which could not be exercised before an agent
 * with `sdd-command` allowed existed.
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
  const dir = mkdtempSync(join(tmpdir(), 'sdd-e2e-w-'));
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

function sddCommandOutputs(parts: Part[]): ToolPart[] {
  return parts.filter(
    (part): part is ToolPart =>
      part.type === 'tool' && part.tool === 'sdd-command' && part.state.status === 'completed',
  );
}

/** Extract the output text from a completed sdd-command tool part. */
function outputText(part: ToolPart): string {
  const output = (part.state as { output?: unknown }).output;
  return typeof output === 'string' ? output : '';
}

describe('sdd-command worker e2e', () => {
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

  it('returns the Loaded header + rewritten markdown for an allowlisted command', async () => {
    const directory = tempProjectDir();
    mock.reset(sddCommandScenario('prd-validate'));

    const client = server.client;
    const session = await createSession(client, directory);
    await client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: 'text', text: 'load the validate stage' }] },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    const outputs = sddCommandOutputs(parts);
    expect(outputs.length, 'expected a completed sdd-command tool call').toBeGreaterThanOrEqual(1);
    const text = outputs.map(outputText).join('\n');
    expect(text).toContain('Loaded command "prd-validate" from ');
    expect(text).not.toContain('@opencode-sdd-templates/');
  });

  it('returns the error string for a non-allowlisted command and does not throw', async () => {
    const directory = tempProjectDir();
    mock.reset(sddCommandScenario('prd-write'));

    const client = server.client;
    const session = await createSession(client, directory);
    await client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: 'text', text: 'load the write stage' }] },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    const outputs = sddCommandOutputs(parts);
    expect(outputs.length).toBeGreaterThanOrEqual(1);
    const text = outputs.map(outputText).join('\n');
    expect(text).toContain('is not a loadable command');
    expect(text).toContain('Available commands:');
    expect(text).not.toContain('Loaded command');
  });
});
