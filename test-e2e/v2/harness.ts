/**
 * V2 e2e harness: an in-process `@opencode/sdk` host plus helpers for the
 * real-`opencode2` loader smoke.
 *
 * The in-process lane passes the plugin object straight into
 * `OpenCode.create({ plugins })`, which bypasses the V2 config loader — that is
 * what the loader smoke (spawning the real binary) covers. Both share the
 * host-neutral isolation helpers from `../shared/harness.js`.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenCode } from '@opencode/sdk';
import sddPlugin from '../../src/index.js';
import { MOCK_MODEL_ID } from '../shared/mock-server-chunks.js';
import {
  isolateHome,
  isolateServerAuth,
  V2_PLUGIN_FILE_URL,
  type IsolatedHome,
} from '../shared/harness.js';

/** The in-process host client returned by `OpenCode.create`. */
export type V2Client = OpenCode.Interface;

/** A running in-process V2 host plus its teardown. */
export interface V2HostHandle {
  /** In-process client (`sessions`, `message`, `agent`, `command`, ...). */
  readonly client: V2Client;
  /** Close the host and restore the isolated environment. Idempotent. */
  close(): Promise<void>;
}

/**
 * Build a V2 config body routing `mock/mock-model` at the local mock LLM.
 *
 * V2 uses `providers` (with `package` + `settings`) instead of V1's
 * `provider`/`npm`/`options`, and a `permissions` ruleset instead of a
 * `permission` map. The two rules auto-approve file edits and external-dir
 * access so tests can write into temp project dirs without prompts.
 *
 * @param mockBaseUrl - The mock's `/v1` base URL.
 * @returns The V2 config body.
 */
export function v2MockConfig(mockBaseUrl: string): Record<string, unknown> {
  return {
    model: `mock/${MOCK_MODEL_ID}`,
    providers: {
      mock: {
        package: '@ai-sdk/openai-compatible',
        settings: { apiKey: 'test', baseURL: mockBaseUrl },
        models: {
          [MOCK_MODEL_ID]: { name: 'Mock' },
        },
      },
    },
    permissions: [
      { action: 'edit', resource: '*', effect: 'allow' },
      { action: 'external_directory', resource: '*', effect: 'allow' },
    ],
  };
}

/**
 * Build the config a real `opencode2` process loads for the loader smoke: the
 * V2 mock provider plus the local plugin directory.
 *
 * @param mockBaseUrl - The mock's `/v1` base URL.
 * @returns The V2 config body with a `plugins` entry.
 */
export function v2LoaderConfig(mockBaseUrl: string): Record<string, unknown> {
  return { ...v2MockConfig(mockBaseUrl), plugins: [V2_PLUGIN_FILE_URL] };
}

/**
 * Start an in-process V2 host with the real plugin object.
 *
 * The host's global dirs are isolated (so the developer's opencode config is
 * never read) and inherited server-auth vars are stripped. The plugin is
 * passed through `plugins`, so `setup(ctx)` runs when the host boots a
 * location.
 *
 * @param config - V2 config body (see {@link v2MockConfig}).
 * @returns The host handle; call `close()` in `afterAll`.
 */
export async function startV2Host(config: Record<string, unknown>): Promise<V2HostHandle> {
  const home: IsolatedHome = isolateHome();
  const auth = isolateServerAuth();
  try {
    const client = await OpenCode.create({
      config: { content: JSON.stringify(config) },
      plugins: [sddPlugin],
    });
    return {
      client,
      async close() {
        await client.close();
        auth.restore();
        home.restore();
      },
    };
  } catch (error) {
    auth.restore();
    home.restore();
    throw error;
  }
}

/**
 * Create a V2 session rooted at `directory`, optionally bound to an agent.
 *
 * @param client - In-process client.
 * @param directory - Project directory for the session's location.
 * @param agent - Optional agent id to run the session under.
 * @returns The new session id.
 */
export async function createV2Session(
  client: V2Client,
  directory: string,
  agent?: string,
): Promise<string> {
  const session = await client.sessions.create({
    location: { directory },
    ...(agent === undefined ? {} : { agent }),
    title: 'e2e',
  });
  return session.id;
}

/**
 * Send a prompt and wait for the session to go idle.
 *
 * @param client - In-process client.
 * @param sessionID - Target session.
 * @param text - Prompt text.
 */
export async function promptV2(client: V2Client, sessionID: string, text: string): Promise<void> {
  await client.sessions.prompt({ sessionID, text });
  await client.sessions.wait({ sessionID });
}

/**
 * Dispatch a plugin command and wait for the session to go idle.
 *
 * @param client - In-process client.
 * @param sessionID - Target session.
 * @param name - Command name (e.g. `sdd-spec`).
 * @param text - Command arguments.
 */
export async function runV2Command(
  client: V2Client,
  sessionID: string,
  name: string,
  text: string,
): Promise<void> {
  await client.sessions.command({ sessionID, name, text });
  await client.sessions.wait({ sessionID });
}

/** Minimal shape of a V2 message entry used by the extraction helpers. */
interface V2MessageEntry {
  readonly type: string;
  readonly content: ReadonlyArray<{
    readonly type: string;
    readonly name?: string;
    readonly text?: string;
    readonly state?: unknown;
  }>;
}

/** A tool call extracted from a V2 assistant message. */
export interface V2ToolCall {
  readonly name: string;
  readonly input: unknown;
  readonly status: 'completed' | 'error' | string;
  /** Joined text content on a completed call ('' otherwise). */
  readonly text: string;
  /** Error message on a failed call ('' otherwise). */
  readonly error: string;
}

/**
 * Extract tool calls from a session's message history.
 *
 * V2 assistant messages carry a `content` array; tool entries have
 * `type: 'tool'` with `name` and a `state` object (`status`, `input`, ...).
 *
 * @param client - In-process client.
 * @param sessionID - Target session.
 * @returns Tool calls in message order.
 */
export async function v2ToolCalls(client: V2Client, sessionID: string): Promise<V2ToolCall[]> {
  const response = await client.message.list({ sessionID });
  const messages = response.data as unknown as V2MessageEntry[];
  const calls: V2ToolCall[] = [];
  for (const message of messages) {
    if (message.type !== 'assistant') {
      continue;
    }
    for (const entry of message.content) {
      if (entry.type !== 'tool') {
        continue;
      }
      const state = entry.state as {
        status?: string;
        input?: unknown;
        content?: ReadonlyArray<{ type: string; text?: string }>;
        error?: { message?: string };
      };
      calls.push({
        name: entry.name ?? 'unknown',
        input: state.input,
        status: state.status ?? 'unknown',
        text: (state.content ?? [])
          .filter((item) => item.type === 'text')
          .map((item) => item.text ?? '')
          .join('\n'),
        error: state.error?.message ?? '',
      });
    }
  }
  return calls;
}

/**
 * Concatenate the text of a session's assistant messages.
 *
 * @param client - In-process client.
 * @param sessionID - Target session.
 * @returns Joined assistant text.
 */
export async function v2AssistantText(client: V2Client, sessionID: string): Promise<string> {
  const response = await client.message.list({ sessionID });
  const messages = response.data as unknown as V2MessageEntry[];
  return messages
    .filter((message) => message.type === 'assistant')
    .flatMap((message) => message.content)
    .filter((entry) => entry.type === 'text')
    .map((entry) => entry.text ?? '')
    .join('\n');
}

/**
 * Whether `opencode2` (the V2 binary shipped by `@opencode/cli`) is on PATH.
 *
 * @returns `true` when `opencode2 --version` runs successfully.
 */
export function opencode2Available(): boolean {
  try {
    execFileSync('opencode2', ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      shell: process.platform === 'win32',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a provider config that boots a location without ever calling a model.
 *
 * A location's session instance only materializes when a model/provider is
 * configured; tests that only assert registration use this unreachable URL.
 *
 * @returns A V2 config body with an idle mock provider.
 */
export function v2IdleConfig(): Record<string, unknown> {
  return v2MockConfig('http://127.0.0.1:1/v1');
}

/** Result of {@link runOpencode2}. */
export interface Opencode2Result {
  /** Process exit code (`null` when killed or failed to spawn). */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run the real `opencode2` binary asynchronously.
 *
 * Asynchronous spawning is load-bearing: the mock LLM runs in the same vitest
 * worker, and a `spawnSync` call would block that worker's event loop, starve
 * the mock, and hang the CLI until the timeout.
 *
 * @param args - Arguments after the binary name.
 * @param options - Working directory, environment, and timeout.
 * @returns Captured streams and the exit status.
 */
export function runOpencode2(
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<Opencode2Result> {
  return new Promise((resolve) => {
    const child = spawn('opencode2', [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr: `${stderr}${String(error)}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  });
}

/**
 * Create a temp project directory for a loader-smoke run.
 *
 * @returns The created directory.
 */
export function tempProjectDir(): string {
  return mkdtempSync(join(tmpdir(), 'sdd-e2e-v2-'));
}

/**
 * Remove a temp project directory created by {@link tempProjectDir}.
 *
 * @param directory - Directory to remove.
 */
export function removeProjectDir(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}
