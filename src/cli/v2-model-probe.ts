import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { platform } from 'node:os';
import type { Model } from '@opencode-ai/sdk';
import type { ProbeDefaults, ProbeResult } from './model-probe.js';

/**
 * A spawned `opencode serve` child, reduced to what the probe needs.
 *
 * @internal Exported for tests only; not part of the public module API.
 *   Tests build handles to inject through {@link V2ProbeDeps.spawnServe}.
 */
export interface V2ServerHandle {
  /** Base URL printed by the server, without a trailing slash. */
  readonly url: string;
  /** Terminate the child process. */
  close(): void;
}

/** Dependency injection for {@link probeV2}. */
export interface V2ProbeDeps {
  /** Overrides the `opencode serve` spawn (tests). */
  spawnServe?: (password: string) => Promise<V2ServerHandle>;
  /** Overrides the authenticated JSON fetch (tests). */
  fetchJson?: (url: string, headers: Readonly<Record<string, string>>) => Promise<unknown>;
  /** Overrides the generated server password (tests). */
  createPassword?: () => string;
  /** How many times to poll the model catalog before giving up. */
  maxModelAttempts?: number;
  /** Delay between model-catalog polls, in milliseconds. */
  retryDelayMs?: number;
}

/** How long to wait for `opencode serve` to print its listening URL. */
const SERVER_START_TIMEOUT_MS = 30_000;

/** Environment variable that sets the V2 server password. */
const PASSWORD_ENV = 'OPENCODE_SERVER_PASSWORD';

/** Environment variable that sets the V2 server username. */
const USERNAME_ENV = 'OPENCODE_SERVER_USERNAME';

/** Username paired with the generated password (Basic auth). */
const USERNAME = 'opencode';

/** Default number of model-catalog polls (the catalog loads asynchronously). */
const DEFAULT_MODEL_ATTEMPTS = 10;

/** Default delay between model-catalog polls, in milliseconds. */
const DEFAULT_RETRY_DELAY_MS = 250;

/** A V2 model entry as returned by `GET /api/model`. */
interface V2ModelEntry {
  readonly id?: unknown;
  readonly modelID?: unknown;
  readonly providerID?: unknown;
  readonly name?: unknown;
}

/**
 * Build a Basic-auth header value for the generated server credentials.
 *
 * @param password - Generated server password.
 * @returns The `Authorization` header value.
 */
function authHeader(password: string): string {
  return `Basic ${Buffer.from(`${USERNAME}:${password}`).toString('base64')}`;
}

/**
 * Generate a random server password.
 *
 * @returns A URL-safe random string.
 */
function defaultPassword(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Spawn `opencode serve` with a known password and resolve once it prints its
 * listening URL.
 *
 * `--port 0` lets the OS pick a free port; the URL is parsed from the
 * `server listening on http://...` banner (stdout or stderr).
 *
 * @param password - Password exported to the child as `OPENCODE_SERVER_PASSWORD`.
 * @returns The running server handle.
 */
function defaultSpawnServe(password: string): Promise<V2ServerHandle> {
  return new Promise<V2ServerHandle>((resolve, reject) => {
    const child = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', '0'], {
      env: { ...process.env, [PASSWORD_ENV]: password, [USERNAME_ENV]: USERNAME },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: platform() === 'win32',
    });
    let buffer = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('timed out waiting for `opencode serve` to start'));
    }, SERVER_START_TIMEOUT_MS);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const match = /server listening on (https?:\/\/\S+)/.exec(buffer);
      if (match !== null && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ url: match[1].replace(/\/$/, ''), close: () => child.kill() });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`\`opencode serve\` exited with code ${String(code)}`));
      }
    });
  });
}

/**
 * Default authenticated JSON fetch.
 *
 * @param url - Absolute URL to fetch.
 * @param headers - Request headers (Basic auth).
 * @returns The parsed JSON body.
 * @throws Error when the response is not OK.
 */
async function defaultFetchJson(
  url: string,
  headers: Readonly<Record<string, string>>,
): Promise<unknown> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

/**
 * Render an unknown thrown value as a one-line message.
 *
 * @param error - Thrown value.
 * @returns A human-readable message.
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Map a V2 model entry onto the V1 `Model` shape the wizard consumes.
 *
 * Only `id`, `providerID`, and `name` are meaningful to the recommendation
 * engine and the selection formatter; the remaining V1 `Model` fields are
 * synthesized because the probe's return type is shared with the V1 lane.
 *
 * @param entry - Raw `GET /api/model` entry.
 * @returns A model usable by `recommend`/`formatModelValue`.
 */
function toProbeModel(entry: V2ModelEntry): Model | null {
  const id = typeof entry.modelID === 'string' ? entry.modelID : entry.id;
  if (typeof id !== 'string' || typeof entry.providerID !== 'string') {
    return null;
  }
  const name = typeof entry.name === 'string' ? entry.name : id;
  return { id, providerID: entry.providerID, name } as unknown as Model;
}

/**
 * Read the model catalog, polling until it is populated or attempts run out.
 *
 * The V2 model catalog is assembled asynchronously after boot, so the first
 * `/api/model` response can be empty even when providers are configured.
 *
 * @param fetchJson - Fetch implementation.
 * @param baseUrl - Server base URL.
 * @param headers - Auth headers.
 * @param attempts - Maximum number of polls.
 * @param delayMs - Delay between polls.
 * @returns Mapped models (possibly empty).
 */
async function pollModels(
  fetchJson: V2ProbeDeps['fetchJson'],
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
  attempts: number,
  delayMs: number,
): Promise<Model[]> {
  const fetchImpl = fetchJson ?? defaultFetchJson;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const payload = await fetchImpl(`${baseUrl}/api/model`, headers);
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data) && data.length > 0) {
      return data
        .map((entry) => toProbeModel(entry as V2ModelEntry))
        .filter((model): model is Model => model !== null);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return [];
}

/**
 * Read the default model from `GET /api/model/default`.
 *
 * @param fetchJson - Fetch implementation.
 * @param baseUrl - Server base URL.
 * @param headers - Auth headers.
 * @returns Probe defaults (empty when no default is set).
 */
async function readDefaults(
  fetchJson: V2ProbeDeps['fetchJson'],
  baseUrl: string,
  headers: Readonly<Record<string, string>>,
): Promise<ProbeDefaults> {
  const fetchImpl = fetchJson ?? defaultFetchJson;
  const payload = await fetchImpl(`${baseUrl}/api/model/default`, headers);
  const data = (payload as { data?: V2ModelEntry | null }).data;
  if (data === null || data === undefined || typeof data !== 'object') {
    return {};
  }
  const id = typeof data.modelID === 'string' ? data.modelID : data.id;
  if (typeof id !== 'string' || typeof data.providerID !== 'string') {
    return {};
  }
  return { model: `${data.providerID}/${id}` };
}

/**
 * Probe a V2 host for available models by spawning `opencode serve` with a
 * generated password and reading its HTTP API.
 *
 * Failure stays soft: spawn errors, HTTP errors, and an empty catalog all
 * return a `ProbeFail` so the install wizard can degrade to writing no model
 * assignments. The child is always terminated.
 *
 * @param deps - Optional dependency injection.
 * @returns Models plus the default model reference, or a typed failure.
 */
export async function probeV2(deps: V2ProbeDeps = {}): Promise<ProbeResult> {
  const spawnServe = deps.spawnServe ?? defaultSpawnServe;
  const createPassword = deps.createPassword ?? defaultPassword;
  const attempts = deps.maxModelAttempts ?? DEFAULT_MODEL_ATTEMPTS;
  const delayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const password = createPassword();
  const headers = { authorization: authHeader(password) };
  let server: V2ServerHandle | null = null;
  try {
    server = await spawnServe(password);
    const models = await pollModels(deps.fetchJson, server.url, headers, attempts, delayMs);
    if (models.length === 0) {
      return {
        ok: false,
        kind: 'zero-models',
        message: 'no models reachable from the configured providers',
      };
    }
    const defaults = await readDefaults(deps.fetchJson, server.url, headers);
    return { ok: true, models, defaults };
  } catch (error) {
    return { ok: false, kind: 'server-start', message: describeError(error) };
  } finally {
    server?.close();
  }
}
