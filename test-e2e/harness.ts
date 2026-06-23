/**
 * E2E test harness: opencode-binary + build guards, server lifecycle, and
 * session helpers shared by every `*.e2e.test.ts`.
 *
 * The plugin is loaded from the compiled `build/index.js` via a `file://` URL
 * pointing at the repo root (opencode resolves `package.json#main`). The
 * binary and build guards live here as the single source of truth and are
 * invoked once from the vitest `globalSetup`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createOpencodeClient,
  createOpencodeServer,
  type Config,
  type OpencodeClient,
  type Session,
} from '@opencode-ai/sdk';
import { MOCK_MODEL_ID } from './mock-server-chunks.js';

/** Absolute repo root (parent of this `test-e2e/` directory). */
export const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** `file://` URL opencode loads the plugin from. */
export const PLUGIN_FILE_URL = pathToFileURL(REPO_ROOT).href;

/**
 * Throw a clear error if the `opencode` binary is not on PATH.
 *
 * Exported so the vitest `globalSetup` fails loudly before any test spawns a
 * server, rather than each test failing with an opaque spawn error.
 */
export function requireOpencodeBinary(): void {
  try {
    execFileSync('opencode', ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    throw new Error(
      'opencode binary not found on PATH. Install it (for example ' +
        '`brew install opencode`) to run e2e tests.',
    );
  }
}

/**
 * Throw a clear error if the plugin build is missing. The plugin is loaded
 * from `build/index.js`, so a stale/absent build makes every e2e test pass
 * vacuously (no commands registered) or fail confusingly.
 */
export function requireBuild(): void {
  const entry = join(REPO_ROOT, 'build', 'index.js');
  if (!existsSync(entry)) {
    throw new Error(`Plugin build not found at ${entry}. Run \`pnpm build\` first.`);
  }
}

/** Build a base plugin config, spread-merged with any extra fields. */
export function pluginConfig(extras: Config = {}): Config {
  return { plugin: [PLUGIN_FILE_URL], ...extras };
}

/**
 * Build an opencode provider config that routes the `mock/mock-model` model at
 * a local OpenAI-compatible mock LLM (served by `createMockLlm`).
 *
 * `permission.edit = "allow"` auto-approves file writes, and
 * `external_directory = "allow"` covers writes to the temp project dir, which
 * lives outside the repo the opencode server started in (spike 0b, option a:
 * config-based auto-approve — the only mechanism needed).
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

/** Environment keys opencode uses to locate its config/cache/state dirs. */
const HOME_ENV_KEYS = ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const;

type HomeEnvKey = (typeof HOME_ENV_KEYS)[number];

/** Object returned by {@link isolateHome} to undo the env rewrite. */
interface IsolatedHome {
  /** Restore the original env values and remove the temp home dir. */
  restore(): void;
}

/**
 * Point opencode's filesystem footprint (config, cache, and state — all
 * derived from `HOME` or the `XDG_*` dirs) at a fresh temp directory.
 *
 * opencode derives its global dirs from `HOME` / the `XDG_*` environment
 * variables. When the e2e suite runs its test files in parallel (vitest's
 * default), each file spawns its own opencode server that would otherwise
 * share those global dirs and intermittently collide — one server would exit
 * mid-test with an opaque "Unexpected error". Giving every server an isolated
 * home makes them fully independent.
 *
 * The server is a child process that snapshots `process.env` at launch, so the
 * parent's environment can be restored (via the returned `restore`) as soon as
 * the server has started without affecting the already-running child.
 */
function isolateHome(): IsolatedHome {
  const saved: Partial<Record<HomeEnvKey, string | undefined>> = {};
  for (const key of HOME_ENV_KEYS) {
    saved[key] = process.env[key];
  }
  const home = mkdtempSync(join(tmpdir(), 'sdd-e2e-home-'));
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = join(home, 'config');
  process.env.XDG_CACHE_HOME = join(home, 'cache');
  process.env.XDG_DATA_HOME = join(home, 'data');
  return {
    restore: () => {
      for (const key of HOME_ENV_KEYS) {
        const value = saved[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      rmSync(home, { recursive: true, force: true });
    },
  };
}

/**
 * Start an opencode server with `config`, run `fn` against a client, and close
 * the server (and its isolated home) in `finally`.
 */
export async function withOpencodeServer<T>(
  config: Config,
  fn: (client: OpencodeClient) => Promise<T>,
): Promise<T> {
  const home = isolateHome();
  let server: Awaited<ReturnType<typeof createOpencodeServer>> | undefined;
  try {
    server = await createOpencodeServer({
      hostname: '127.0.0.1',
      port: 0,
      timeout: 30_000,
      config,
    });
    const client = createOpencodeClient({ baseUrl: server.url });
    return await fn(client);
  } finally {
    server?.close();
    home.restore();
  }
}

/** Create a session rooted at `directory`, throwing on failure. */
export async function createSession(client: OpencodeClient, directory: string): Promise<Session> {
  const res = await client.session.create({ query: { directory } });
  if (res.data === undefined) {
    throw new Error(`session.create failed: ${JSON.stringify(res.error ?? 'no data')}`);
  }
  return res.data;
}
