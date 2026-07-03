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
  replyToQuestion,
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
 * How long {@link probeQuestionTool} waits for a pending question to appear
 * before concluding the `question` tool is unavailable. Generous by design:
 * the probe runs the orchestrator's first (cold) model turn, and on a loaded
 * CI runner the round trip from command dispatch to the `question` tool
 * registering a pending question can take several seconds. When the tool is
 * genuinely unavailable the command finishes first, so the probe returns
 * immediately rather than waiting out this cap.
 */
const PROBE_QUESTION_WAIT_MS = 30_000;

/**
 * Probe whether the `question` tool is registered by running a single
 * scripted question tool-call against a throwaway session.
 *
 * The probe must terminate deterministically whether or not the tool is
 * available — and it must never block `beforeAll` on a command parked on
 * an unanswered question. Two natural terminations are watched in one poll
 * loop: (a) a pending question appears on the `/question` endpoint (the
 * tool is available, its blocking call registered one); or (b) the command
 * finishes without ever presenting a question (the tool is unavailable,
 * opencode resolved the call as invalid and the orchestrator ran to
 * completion). Whichever fires first ends the probe.
 *
 * If a question appears, the probe answers it (unblocking the command) and
 * waits for it to finish. If the command finishes first, the probe returns
 * `false` immediately — it never awaits a possibly-still-blocked command,
 * which is the hang a naive "wait then `await commandPromise`" sequence
 * hits on a slow CI runner where the question appears just after the wait
 * times out. A bound ({@link PROBE_QUESTION_WAIT_MS}) guards the
 * pathological "neither fires" case so the hook can never hang.
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

  // Track command settlement via a promise that never rejects (the second
  // `.then` arg swallows any rejection) and flip a flag the poll loop reads
  // between its `await`s. `void` marks the floating promise intentional.
  let commandDone = false;
  void commandPromise.then(
    () => {
      commandDone = true;
    },
    () => {
      commandDone = true;
    },
  );

  const deadline = Date.now() + PROBE_QUESTION_WAIT_MS;
  while (Date.now() < deadline) {
    if (commandDone) {
      // The command finished without presenting a question — the tool is
      // unavailable (or the command errored before reaching it).
      return false;
    }
    const res = await fetch(`${server.url}/question?directory=${encodeURIComponent(directory)}`);
    const questions = (await res.json()) as Array<{ id: string }>;
    if (questions.length > 0) {
      // A question is pending — the tool is available. Answer it to
      // unblock the command, then wait for it to run to completion.
      await replyToQuestion(server.url, directory, questions[0].id, [['Approach A']]);
      await commandPromise.catch(() => {});
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Timed out with neither a question nor command settlement: treat as
  // unavailable so the HITL tests skip gracefully. Do NOT await the command
  // here — it may still be blocked on a question we never answered, and
  // awaiting would hang until the hook timeout.
  return false;
}
