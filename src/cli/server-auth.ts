/**
 * Environment keys that opencode's server reads to enable HTTP Basic
 * auth.
 *
 * When the install wizard is run from *inside* a parent opencode
 * session (e.g. the user runs `opencode-sdd install` via an
 * opencode-powered agent), the parent opencode process exports
 * `OPENCODE_SERVER_PASSWORD` so its own server is authenticated. The
 * SDK's `createOpencodeServer` spreads `process.env` into the spawned
 * child, so the model probe's headless server would inherit that
 * password, enable Basic auth, and reject every SDK request with
 * `401` (the SDK client does not send credentials). Stripping these
 * vars from the child's environment makes the probe's server run
 * auth-free (it only ever binds `127.0.0.1` for the duration of a
 * probe), isolating it from the parent session.
 */
const SERVER_AUTH_ENV_KEYS = ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME'] as const;

/** Object returned by {@link isolateServerAuth} to undo the env rewrite. */
export interface IsolatedAuth {
  /** Restore the original env values (delete if they were never set). */
  restore(): void;
}

/**
 * Strip the inherited opencode server-auth env vars from `process.env`
 * so the model probe's headless server (spawned by the SDK, which
 * spreads `process.env`) does not enable HTTP Basic auth. Returns a
 * `restore` that puts the original values back.
 *
 * This is the shipped reimplementation of `test-e2e/harness.ts`'s
 * `isolateServerAuth()`. The harness is test-only code under
 * `test-e2e/` and cannot be imported by shipped CLI code (the
 * plugin/CLI never imports from `test-e2e/`), so the helper is
 * reimplemented here byte-for-behaviour. The behaviour is pinned by
 * `src/cli/server-auth.test.ts`, which mirrors
 * `test-e2e/harness.test.ts`'s two auth tests exactly.
 *
 * Necessary when the wizard runs inside a parent opencode session that
 * exports `OPENCODE_SERVER_PASSWORD`; see
 * {@link SERVER_AUTH_ENV_KEYS}. Deliberately does NOT isolate the
 * user's home (unlike the harness's `isolateHome`) — the probe must
 * see the user's real providers and credentials.
 */
export function isolateServerAuth(): IsolatedAuth {
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
