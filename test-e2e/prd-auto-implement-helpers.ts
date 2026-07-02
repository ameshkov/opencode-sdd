/**
 * Shared helpers for `prd-auto-implement` e2e test files. Extracted so the
 * growing test suite can split into focused files (e.g. resume behaviour)
 * without duplicating the server lifecycle, session helpers, and
 * mock-prompt capture utilities.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OpencodeClient, Part, ToolPart } from '@opencode-ai/sdk';
import {
  createSession,
  mockProviderConfig,
  pluginConfig,
  replyToPendingQuestion,
  startOpencodeServer,
  type OpencodeServerHandle,
} from './harness.js';
import { createMockLlm, type MockLlmState } from './mock-server.js';
import { autoImplementHitlPauseScenario } from './scenarios.js';

/** A cleanup function pushed onto a test file's cleanup stack. */
export type CleanupFn = () => void;

/**
 * Create a temp project directory and register its removal on `cleanup`.
 *
 * @param cleanup - The test file's cleanup stack (drained in `afterEach`).
 * @returns The absolute path of the temp directory.
 */
export function tempProjectDir(cleanup: CleanupFn[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-e2e-ai-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Run the `prd-auto-implement` command in a session. */
export async function runAutoImplement(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
): Promise<void> {
  await client.session.command({
    path: { id: sessionId },
    body: { command: 'prd-auto-implement', arguments: '' },
    query: { directory },
  });
}

/** Fetch all parts from a session's messages. */
export async function sessionParts(
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

/** Completed tool parts for a given tool name, in session order. */
export function completedTools(parts: Part[], name: string): ToolPart[] {
  return parts.filter(
    (part): part is ToolPart =>
      part.type === 'tool' && part.tool === name && part.state.status === 'completed',
  );
}

/** Read a key off a completed tool part's input. */
export function inputField(part: ToolPart, key: string): unknown {
  const input = (part.state as { input?: Record<string, unknown> }).input;
  return input?.[key];
}

/** Concatenate every text fragment sent to the mock LLM across requests. */
export function capturedPromptText(mock: MockLlmState): string {
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

/**
 * Shared state for a `prd-auto-implement` e2e test file: the running server,
 * the mock LLM, and whether the `question` tool is available on this
 * server build.
 */
export interface AutoImplementSetup {
  server: OpencodeServerHandle;
  mock: MockLlmState;
  /**
   * Whether the opencode server build exposes the `question` tool to the
   * model. The tool is gated to `app`/`cli`/`desktop` clients or the
   * `OPENCODE_ENABLE_QUESTION_TOOL` flag; in headless `opencode serve` mode
   * (used by this suite) it is frequently unavailable — see upstream issues
   * #20514, #27644, #19702. When unavailable, the HITL pause/resume tests
   * are skipped at runtime rather than failing: the prompt content they
   * would exercise is already covered by the unit test in
   * `src/commands/markdown.test.ts`, and the plumbing tests auto-activate
   * once a server build with the question tool is used.
   */
  questionAvailable: boolean;
}

/**
 * Start a mock LLM + opencode server (with the SDD plugin and mock provider)
 * and probe whether the `question` tool is registered. The caller is
 * responsible for closing `setup.server` and `setup.mock` in `afterAll`.
 *
 * @param cleanup - The test file's cleanup stack (used by the question probe).
 * @returns The shared setup.
 */
export async function setupAutoImplementServer(cleanup: CleanupFn[]): Promise<AutoImplementSetup> {
  const mock = await createMockLlm([]);
  const server = await startOpencodeServer(pluginConfig(mockProviderConfig(`${mock.url}/v1`)));
  const questionAvailable = await probeQuestionTool(server, mock, cleanup);
  return { server, mock, questionAvailable };
}

/**
 * Probe whether the `question` tool is registered by running a single
 * scripted question tool-call against a throwaway session. If the tool is
 * available, the call blocks on a pending question (which the helper
 * answers); if unavailable, opencode resolves it as an `invalid` tool and
 * the command completes without a pending question.
 */
async function probeQuestionTool(
  server: OpencodeServerHandle,
  mock: MockLlmState,
  cleanup: CleanupFn[],
): Promise<boolean> {
  const directory = tempProjectDir(cleanup);
  mock.reset(autoImplementHitlPauseScenario());
  const session = await createSession(server.client, directory);
  const commandPromise = runAutoImplement(server.client, session.id, directory);
  try {
    await replyToPendingQuestion(server.url, directory, [['Approach A']], 2_000);
    await commandPromise;
    return true;
  } catch {
    await commandPromise.catch(() => {});
    return false;
  }
}
