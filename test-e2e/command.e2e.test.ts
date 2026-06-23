/**
 * E2E: drive SDD commands through a real opencode server against a local mock
 * LLM. Each test scripts the model's turns (one or more `write` tool-call
 * turns, then a final text turn that ends the agent loop), invokes a command
 * via the blocking `session.command` API (it resolves once the loop reaches
 * idle), and asserts on the files written to disk and the tool parts recorded
 * in the session.
 *
 * The mock ignores the prompt, so the command choice (`sdd-spec`) only
 * exercises the plumbing — command dispatch -> model -> tool execution — plus
 * the template-asset inlining path (see the "absolute-path mentions" test).
 * To add a case: build a scenario in `scenarios.ts`, load it into the shared
 * mock via `mock.reset(...)` + `runSpec`, and assert via `sessionParts` /
 * `completedWriteTools`; keep scenarios fully scripted so runs stay
 * deterministic.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OpencodeClient, Part, ToolPart } from '@opencode-ai/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  REPO_ROOT,
  createSession,
  mockProviderConfig,
  pluginConfig,
  startOpencodeServer,
  type OpencodeServerHandle,
} from './harness.js';
import { createMockLlm, type MockLlmState } from './mock-server.js';
import { writeFileScenario, writeFilesScenario } from './scenarios.js';

/** Temp dirs and mocks created during a test, cleaned up afterwards. */
const cleanup: Array<() => void> = [];

afterEach(() => {
  while (cleanup.length > 0) {
    const fn = cleanup.pop();
    if (fn === undefined) {
      continue;
    }
    try {
      fn();
    } catch {
      /* best-effort cleanup */
    }
  }
});

/** Create a unique temp project dir, registered for cleanup. */
function tempProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-e2e-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Invoke the `sdd-spec` command in `directory`. The scripted mock ignores
 * the prompt and replays its scenario, so the command choice only exercises the
 * plumbing (command dispatch -> model -> write tool). `session.command` blocks
 * until the agent loop reaches idle, so the scripted files are on disk by the
 * time it resolves.
 */
async function runSpec(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
): Promise<void> {
  await client.session.command({
    path: { id: sessionId },
    body: { command: 'sdd-spec', arguments: 'fix the login 500 error' },
    query: { directory },
  });
}

/** Flatten all parts across every message in a session. */
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

/** Extract `write` tool parts with a completed state from a session. */
function completedWriteTools(parts: Part[]): ToolPart[] {
  return parts.filter(
    (part): part is ToolPart =>
      part.type === 'tool' && part.tool === 'write' && part.state.status === 'completed',
  );
}

/**
 * Concatenate every text fragment sent to the mock LLM across all captured
 * `/v1/chat/completions` requests. Handles `content` either as a plain
 * string or as an array of OpenAI content parts (`{ type: 'text', text }`).
 */
function capturedPromptText(mock: MockLlmState): string {
  const out: string[] = [];
  for (const { body } of mock.requests) {
    const parsed = body as { messages?: Array<{ role: string; content?: unknown }> } | undefined;
    for (const message of parsed?.messages ?? []) {
      const content = message.content;
      if (typeof content === 'string') {
        out.push(content);
        continue;
      }
      if (Array.isArray(content)) {
        for (const part of content) {
          if (
            part !== null &&
            typeof part === 'object' &&
            (part as { type?: string }).type === 'text'
          ) {
            out.push((part as { text?: string }).text ?? '');
          }
        }
      }
    }
  }
  return out.join('\n');
}

describe('command e2e: mock-LLM-driven file writes', () => {
  // One opencode server + one mock LLM shared across every test in this
  // file. Server startup dominates wall-clock on Windows CI (~60-75s per
  // cold start); paying it once — instead of per test — keeps every test
  // well under the timeout. Each test reloads its own scenario into the
  // shared mock via `mock.reset(...)` before driving a fresh session.
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

  it('writes a single scripted file', async () => {
    const directory = tempProjectDir();
    const outFile = join(directory, 'output.md');
    mock.reset(writeFileScenario(outFile, '# Test'));

    const client = server.client;
    const session = await createSession(client, directory);
    await runSpec(client, session.id, directory);

    expect(existsSync(outFile), 'output file was not written').toBe(true);
    expect(readFileSync(outFile, 'utf8')).toBe('# Test');

    const parts = await sessionParts(client, session.id, directory);
    const writes = completedWriteTools(parts);
    expect(writes.length, 'expected a completed write tool call').toBeGreaterThanOrEqual(1);
  });

  it('writes multiple scripted files across tool-result round-trips', async () => {
    const directory = tempProjectDir();
    const fileA = join(directory, 'a.md');
    const fileB = join(directory, 'b.md');
    mock.reset(
      writeFilesScenario([
        { filePath: fileA, content: 'A' },
        { filePath: fileB, content: 'B' },
      ]),
    );

    const client = server.client;
    const session = await createSession(client, directory);
    await runSpec(client, session.id, directory);

    expect(existsSync(fileA), 'file A was not written').toBe(true);
    expect(readFileSync(fileA, 'utf8')).toBe('A');
    expect(existsSync(fileB), 'file B was not written').toBe(true);
    expect(readFileSync(fileB, 'utf8')).toBe('B');

    const parts = await sessionParts(client, session.id, directory);
    expect(completedWriteTools(parts).length).toBeGreaterThanOrEqual(2);
  });

  it('inlines template asset files into the prompt via absolute-path mentions', async () => {
    // A distinctive heading from the bundled sdd-spec plan template —
    // if the asset is inlined into the prompt, this text reaches the model.
    const templatePath = join(
      REPO_ROOT,
      'build',
      'assets',
      'commands',
      'templates',
      'sdd-spec',
      'plan-template.md',
    );
    const snippet = '### Patterns to Follow';
    expect(
      readFileSync(templatePath, 'utf8'),
      'fixture snippet must exist in the bundled template',
    ).toContain(snippet);

    const directory = tempProjectDir();
    mock.reset([{ type: 'text', text: 'Done' }]);

    const client = server.client;
    const session = await createSession(client, directory);
    await runSpec(client, session.id, directory);

    const promptText = capturedPromptText(mock);
    expect(promptText, 'template asset was not inlined into the prompt').toContain(snippet);
    expect(promptText, 'portable token was not rewritten to an absolute path').not.toContain(
      '@opencode-sdd-templates',
    );
  });
});
