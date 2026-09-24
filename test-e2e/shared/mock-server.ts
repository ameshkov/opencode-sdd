/**
 * A minimal OpenAI-compatible mock LLM server (`node:http` + SSE, zero deps).
 *
 * Listens on an ephemeral port and replays a scripted list of
 * {@link Turn}s — one per `/v1/chat/completions` request — so tests can drive
 * the opencode agent loop with deterministic tool calls and text, fully
 * offline. Every incoming request body is captured for assertions.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { MOCK_MODEL_ID, textChunks, toolCallChunks } from './mock-server-chunks.js';

/** A single model turn in a scripted scenario. */
export interface Turn {
  type: 'text' | 'tool-call';
  /** Text to stream for a `text` turn. */
  text?: string;
  /** Tool calls to emit for a `tool-call` turn. */
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}

/** A captured incoming request body, in arrival order. */
export interface CapturedRequest {
  body: unknown;
}

/** Handle to a running mock LLM. */
export interface MockLlmState {
  /** Base URL of the running mock, e.g. `http://127.0.0.1:54321`. */
  url: string;
  /** Stop the mock HTTP server. */
  close(): void;
  /** Every incoming POST body, in arrival order. */
  requests: CapturedRequest[];
  /**
   * Replace the scenario queue and clear captured requests, so a shared
   * mock can be reused across independent tests without leaking turns or
   * request history between them.
   *
   * @param scenario - One turn per future `/v1/chat/completions` request.
   */
  reset(scenario: Turn[]): void;
}

interface MockState {
  queue: Turn[];
  requests: CapturedRequest[];
}

/**
 * Marker identifying opencode's background title-generation requests. opencode
 * asks the same provider for a short session title (system prompt
 * "You are a title generator..."). That request is not part of the scripted
 * agent loop and races with it: under some host/container timing it reaches
 * the mock first and would consume the opening scenario turn (e.g. the `write`
 * tool call), silently breaking file-write e2e. Such requests are answered
 * with a canned title and never dequeue a turn.
 */
const TITLE_GENERATOR_MARKER = 'title generator';

/**
 * Whether a captured request body is opencode's background title-generation
 * call rather than a scripted agent-loop turn.
 */
function isTitleGenerationRequest(body: unknown): boolean {
  const messages = (body as { messages?: Array<{ role?: string; content?: unknown }> } | undefined)
    ?.messages;
  if (!Array.isArray(messages)) {
    return false;
  }
  return messages.some((message) => {
    if (message?.role !== 'system' || typeof message.content !== 'string') {
      return false;
    }
    return message.content.toLowerCase().includes(TITLE_GENERATOR_MARKER);
  });
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
} as const;

/**
 * Start a mock LLM that replays `scenario` in order.
 *
 * @param scenario - One turn per `/v1/chat/completions` request.
 * @returns A handle with the base URL, a `close()` fn, and captured requests.
 */
export function createMockLlm(scenario: Turn[]): Promise<MockLlmState> {
  return new Promise((resolve, reject) => {
    const state: MockState = { queue: [...scenario], requests: [] };
    const server = createServer((req, res) => {
      void route(req, res, state).catch((error) => {
        try {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: String(error) }));
        } catch {
          /* connection already torn down */
        }
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('failed to bind mock server to a port'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
        requests: state.requests,
        reset: (scenario: Turn[]) => {
          state.queue = [...scenario];
          // Clear in place: the handle's `requests` field is a reference to
          // this same array (captured at resolve time), so reassigning would
          // leave the handle pointing at the stale buffer.
          state.requests.length = 0;
        },
      });
    });
  });
}

/** Route an incoming request by method + path. */
async function route(req: IncomingMessage, res: ServerResponse, state: MockState): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await handleCompletions(req, res, state);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    handleModels(res);
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'not found' } }));
}

/** Handle `POST /v1/chat/completions`: pop the next turn and stream it. */
async function handleCompletions(
  req: IncomingMessage,
  res: ServerResponse,
  state: MockState,
): Promise<void> {
  const raw = await readBody(req);
  const parsed = safeParse(raw);
  state.requests.push({ body: parsed });

  const requestId = randomUUID();
  let chunks: string[];
  if (isTitleGenerationRequest(parsed)) {
    // Background title generation: answer with a fixed title and leave the
    // scenario queue untouched so the agent loop still gets every turn.
    chunks = textChunks('Mock Title', requestId);
  } else {
    const turn = state.queue.shift() ?? { type: 'text', text: '[mock-exhausted]' };
    chunks =
      turn.type === 'tool-call'
        ? toolCallChunks(turn.toolCalls ?? [], requestId)
        : textChunks(turn.text ?? '', requestId);
  }

  res.writeHead(200, SSE_HEADERS);
  for (const chunk of chunks) {
    res.write(chunk);
  }
  res.end();
}

/** Handle `GET /v1/models`: advertise the single mock model (defensive). */
function handleModels(res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      object: 'list',
      data: [{ id: MOCK_MODEL_ID, object: 'model', owned_by: 'mock' }],
    }),
  );
}

/** Read and concatenate the full request body. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Parse JSON, falling back to the raw string on failure. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
