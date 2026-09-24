/**
 * V1 e2e harness: the real-binary server lifecycle plus the SDK client and
 * question helpers every V1 `*.e2e.test.ts` shares.
 *
 * The plugin is loaded from the compiled `build/index.js` through a `file://`
 * URL pointing at the repo root (V1 resolves `package.json#main`). The binary
 * and build guards are invoked once from the V1 vitest `globalSetup`.
 */
import { execFileSync } from 'node:child_process';
import {
  createOpencodeClient,
  createOpencodeServer,
  type Config,
  type OpencodeClient,
  type Session,
} from '@opencode-ai/sdk';
import { MOCK_MODEL_ID } from '../shared/mock-server-chunks.js';
import {
  isolateHome,
  isolateServerAuth,
  V1_PLUGIN_FILE_URL,
  type IsolatedHome,
} from '../shared/harness.js';

/**
 * Throw a clear error unless a 1.x `opencode` binary is on PATH.
 *
 * The V1 lane only exercises the V1 plugin API; running it against a V2 binary
 * would make every test fail with confusing config-shape errors, so the major
 * version is asserted up front.
 *
 * On Windows the `opencode-ai` npm package exposes `opencode` only as a `.cmd`
 * shim, which Node cannot spawn directly (it throws `EINVAL` without a shell).
 * The opencode SDK sidesteps this with `cross-spawn` when it starts the server;
 * the version probe mirrors that by routing through a shell on Windows. The
 * argument is a fixed literal, so there is no shell-injection surface.
 *
 * @returns The detected `opencode --version` output.
 */
export function requireV1Binary(): string {
  let raw: string;
  try {
    raw = execFileSync('opencode', ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    throw new Error(
      'opencode binary not found on PATH or failed to run. Install it ' +
        '(for example `npm install -g opencode-ai@1.18.29`) to run the V1 e2e lane.',
      { cause: error },
    );
  }
  const match = /(\d+)\./.exec(raw);
  if (match === null || match[1] !== '1') {
    throw new Error(
      `The V1 e2e lane requires an opencode 1.x binary on PATH, but \`opencode --version\` ` +
        `reported ${JSON.stringify(raw)}. Install 1.x (e.g. ` +
        '`npm install -g opencode-ai@1.18.29`) and re-run.',
    );
  }
  return raw;
}

/** Build a base V1 plugin config, spread-merged with any extra fields. */
export function pluginConfig(extras: Config = {}): Config {
  return { plugin: [V1_PLUGIN_FILE_URL], ...extras };
}

/**
 * Build a V1 opencode provider config that routes the `mock/mock-model` model
 * at a local OpenAI-compatible mock LLM (served by `createMockLlm`).
 *
 * `permission.edit = "allow"` auto-approves file writes, and
 * `external_directory = "allow"` covers writes to the temp project dir, which
 * lives outside the repo the opencode server started in.
 *
 * @param mockBaseUrl - The mock's `/v1` base URL (e.g. `http://127.0.0.1:PORT/v1`).
 */
export function mockProviderConfig(mockBaseUrl: string): Config {
  return {
    provider: {
      mock: {
        npm: '@ai-sdk/openai-compatible',
        options: { apiKey: 'test', baseURL: mockBaseUrl },
        models: {
          [MOCK_MODEL_ID]: { name: 'Mock', tool_call: true },
        },
      },
    },
    model: `mock/${MOCK_MODEL_ID}`,
    permission: { edit: 'allow', external_directory: 'allow' },
  };
}

/**
 * Start an opencode V1 server with `config`, run `fn` against a client, and
 * close the server (and its isolated home) in `finally`.
 */
export async function withOpencodeServer<T>(
  config: Config,
  fn: (client: OpencodeClient) => Promise<T>,
): Promise<T> {
  const handle = await startOpencodeServer(config);
  try {
    return await fn(handle.client);
  } finally {
    handle.close();
  }
}

/**
 * A started opencode V1 server with an isolated home, plus the client to talk
 * to it and a `close` that tears both down. Use {@link startOpencodeServer}
 * when multiple tests in a file want to share a single server (amortizing the
 * slow startup, which matters on Windows CI); otherwise prefer
 * {@link withOpencodeServer} for the automatic cleanup.
 */
export interface OpencodeServerHandle {
  /** Client bound to the running server's base URL. */
  client: OpencodeClient;
  /** Base URL of the running server (for raw API calls not wrapped by the SDK). */
  url: string;
  /** Close the server and restore the isolated home. Idempotent. */
  close(): void;
}

/**
 * Start an opencode V1 server with `config` and an isolated home, returning a
 * handle whose `close` tears it down. The caller is responsible for calling
 * `close` (typically in `afterAll`).
 *
 * The server is isolated from the host on two axes: its opencode home (config,
 * cache, state) is a fresh temp dir, and any inherited `OPENCODE_SERVER_*`
 * auth env vars are stripped so it serves unauthenticated on `127.0.0.1` (the
 * SDK client does not send Basic credentials).
 */
export async function startOpencodeServer(config: Config): Promise<OpencodeServerHandle> {
  const home: IsolatedHome = isolateHome();
  const auth = isolateServerAuth();
  const server = await createOpencodeServer({
    hostname: '127.0.0.1',
    port: 0,
    timeout: 30_000,
    config,
  });
  const client = createOpencodeClient({ baseUrl: server.url });
  return {
    client,
    url: server.url,
    close() {
      server.close();
      auth.restore();
      home.restore();
    },
  };
}

/** Create a session rooted at `directory`, throwing on failure. */
export async function createSession(client: OpencodeClient, directory: string): Promise<Session> {
  const res = await client.session.create({ query: { directory } });
  if (res.data === undefined) {
    throw new Error(`session.create failed: ${JSON.stringify(res.error ?? 'no data')}`);
  }
  return res.data;
}

/**
 * Reply to a pending question by id via the raw `/question/:id/reply` API.
 *
 * The v1 SDK client does not wrap `/question`, so this posts the answer
 * directly. The `/question` routes are server-global (not session-scoped),
 * scoped by the `directory` query param. Use {@link replyToPendingQuestion}
 * to wait for a question to appear before replying.
 *
 * @param baseUrl - The opencode server base URL.
 * @param directory - The project directory (scoping query param).
 * @param questionId - The id of the pending question to answer.
 * @param answer - The option labels to select, one array per question.
 */
export async function replyToQuestion(
  baseUrl: string,
  directory: string,
  questionId: string,
  answer: string[][],
): Promise<void> {
  await fetch(
    `${baseUrl}/question/${questionId}/reply?directory=${encodeURIComponent(directory)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: answer }),
    },
  );
}

/**
 * Poll the `/question` endpoint for a pending question and reply with
 * `answer`.
 *
 * The `question` tool blocks the agent loop until the user answers. In e2e
 * tests there is no interactive user, so this helper programmatically replies
 * via the raw HTTP API (the v1 SDK client does not wrap `/question`). The
 * `/question` routes are server-global (not session-scoped), scoped by the
 * `directory` query param.
 *
 * The default wait is deliberately generous: on a loaded CI runner the
 * orchestrator's first model turn (command dispatch, prompt assembly, and the
 * mock LLM round trip that emits the `question` tool-call) can take several
 * seconds to register the pending question.
 *
 * @param baseUrl - The opencode server base URL.
 * @param directory - The project directory (scoping query param).
 * @param answer - The option labels to select, one array per question.
 * @param timeoutMs - How long to wait for a question to appear.
 * @throws When no question appears within `timeoutMs`.
 */
export async function replyToPendingQuestion(
  baseUrl: string,
  directory: string,
  answer: string[][],
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/question?directory=${encodeURIComponent(directory)}`);
    const questions = (await res.json()) as Array<{ id: string }>;
    if (questions.length > 0) {
      await replyToQuestion(baseUrl, directory, questions[0].id, answer);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No pending question appeared within the timeout');
}
