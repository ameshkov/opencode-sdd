/**
 * Host-neutral e2e harness pieces: repo paths, the build guard, and the
 * environment-isolation helpers both host lanes share.
 *
 * The V1 lane (`test-e2e/v1/harness.ts`) starts a real opencode server from
 * the binary; the V2 lane (`test-e2e/v2/harness.ts`) runs an in-process
 * `@opencode/sdk` host and a real-`opencode2` loader smoke. Both need the
 * compiled plugin present and both need opencode's global dirs isolated.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Absolute repo root (parent of this `test-e2e/` directory). */
export const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Compiled plugin entry (`build/index.js`). */
export const BUILD_ENTRY = join(REPO_ROOT, 'build', 'index.js');

/**
 * `file://` URL opencode V1 loads the plugin from.
 *
 * V1 resolves a local directory through the package entry point, so this
 * points at the package root.
 */
export const V1_PLUGIN_FILE_URL = pathToFileURL(REPO_ROOT).href;

/**
 * `file://` URL opencode V2 loads the plugin from.
 *
 * V2 tries `<dir>/server` then `<dir>/index` and ignores
 * `package.json#main`, so this points at the compiled `build/` directory.
 */
export const V2_PLUGIN_FILE_URL = pathToFileURL(join(REPO_ROOT, 'build')).href;

/**
 * Throw a clear error if the plugin build is missing. Both lanes load the
 * compiled plugin, so a stale/absent build makes tests pass vacuously (no
 * commands registered) or fail confusingly.
 */
export function requireBuild(): void {
  if (!existsSync(BUILD_ENTRY)) {
    throw new Error(`Plugin build not found at ${BUILD_ENTRY}. Run \`pnpm build\` first.`);
  }
}

/** Environment keys opencode uses to locate its config/cache/state dirs. */
const HOME_ENV_KEYS = ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const;

type HomeEnvKey = (typeof HOME_ENV_KEYS)[number];

/**
 * Environment keys that opencode's server reads to enable HTTP Basic auth.
 *
 * When the e2e suite is launched from *inside* an opencode session (e.g. the
 * developer runs `pnpm test:e2e` via an opencode-powered agent), the parent
 * opencode process exports `OPENCODE_SERVER_PASSWORD` so its own server is
 * authenticated. The V1 SDK's `createOpencodeServer` spreads `process.env`
 * into the spawned child, so the e2e server would inherit that password,
 * enable Basic auth, and reject every SDK request with `401` — the SDK client
 * does not send credentials. Stripping these vars makes the e2e server run
 * auth-free (it only ever binds `127.0.0.1` for the duration of a test).
 */
const SERVER_AUTH_ENV_KEYS = ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME'] as const;

/** Object returned by {@link isolateHome} to undo the env rewrite. */
export interface IsolatedHome {
  /** Restore the original env values and remove the temp home dir. */
  restore(): void;
}

/**
 * Point opencode's filesystem footprint (config, cache, and state — all
 * derived from `HOME` or the `XDG_*` dirs) at a fresh temp directory.
 *
 * opencode derives its global dirs from `HOME` / the `XDG_*` environment
 * variables. When the e2e suite runs its test files in parallel (vitest's
 * default), each file starts its own host that would otherwise share those
 * global dirs and intermittently collide. Giving every host an isolated home
 * makes them fully independent.
 *
 * A spawned server snapshots `process.env` at launch, so the parent's
 * environment can be restored (via the returned `restore`) as soon as the
 * server has started without affecting the already-running child. An
 * in-process host reads the env synchronously at `create()`, so callers must
 * restore only after creation resolves.
 *
 * @returns The created home path plus a restore function.
 */
export function isolateHome(): IsolatedHome {
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
 * Strip the inherited opencode server auth env vars from `process.env` so a
 * spawned e2e server does not enable HTTP Basic auth. Returns a `restore` that
 * puts the original values back.
 *
 * @returns A restore handle for the stripped variables.
 */
export function isolateServerAuth(): IsolatedHome {
  const saved: Partial<Record<(typeof SERVER_AUTH_ENV_KEYS)[number], string | undefined>> = {};
  for (const key of SERVER_AUTH_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return {
    restore: () => {
      for (const key of SERVER_AUTH_ENV_KEYS) {
        const value = saved[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}
