import { createOpencodeClient, createOpencodeServer, type Model } from '@opencode-ai/sdk';
import { isolateServerAuth } from './server-auth.js';

/**
 * The effective default model values read from the user's opencode config
 * via `client.config.get()`. Both are optional — the config may set
 * neither (the "no default" fallback path).
 *
 * @internal Exported for tests only (used by `model-probe.test.ts` and
 * `yes-selection.test.ts` fixture tables). Not re-exported from the module
 * barrel — consumed directly by co-located test files.
 */
export interface ProbeDefaults {
  /** The user's configured default `model` (top-level opencode config). */
  readonly model?: string;
  /** The user's configured default `small_model` (top-level opencode config). */
  readonly small_model?: string;
}

/**
 * The failure kinds the probe can return.
 *
 * The probe produces two kinds:
 * - `'server-start'` — the catch-all for SDK spawn/start/auth/timeout
 *   failures. The SDK throws (or rejects a client call) without a
 *   reliable signal distinguishing a spawn failure from a server-start
 *   failure from an auth conflict (401) from a probe timeout — all
 *   surface as thrown errors. The `message` field carries the
 *   underlying error text so the wizard's warning can include
 *   specifics.
 * - `'zero-models'` — the server started and responded, but returned
 *   no models (no configured provider, or all providers are
 *   unreachable).
 *
 * If the wizard ever needs finer classification for distinct warning
 * text, it can introspect `message` or add a discriminating kind then
 * (YAGNI today — the wizard treats all `ok: false` the same: warn +
 * skip models + still register the plugin).
 *
 * @internal Exported for tests only (used by `model-probe.test.ts` and
 * `yes-selection.test.ts` to assert failure kinds). Not re-exported from
 * the module barrel — consumed directly by co-located test files.
 */
export type ProbeFailKind = 'server-start' | 'zero-models';

/** The success result of {@link probe}: the enumerated models + defaults.
 *
 * @internal Exported for tests only (used by `model-probe.test.ts` and
 * `yes-selection.test.ts` to assert successful probe results). Not
 * re-exported from the module barrel — consumed directly by co-located
 * test files.
 */
export interface ProbeOk {
  readonly ok: true;
  /** Flattened `Model[]` from `config.providers().data.providers[].models`. */
  readonly models: readonly Model[];
  /** The effective default `model`/`small_model` from `config.get()`. */
  readonly defaults: ProbeDefaults;
}

/** The failure result of {@link probe}: a structured failure kind + message.
 *
 * @internal Exported for tests only (used by `model-probe.test.ts` and
 * `yes-selection.test.ts` to assert failure results). Not re-exported
 * from the module barrel — consumed directly by co-located test files.
 */
export interface ProbeFail {
  readonly ok: false;
  /** See {@link ProbeFailKind}. */
  readonly kind: ProbeFailKind;
  /** The underlying error message (for the wizard's warning text). */
  readonly message: string;
}

/**
 * The result of {@link probe}: either the enumerated models + defaults
 * (success) or a structured failure (the caller decides the
 * graceful-degradation reaction; the probe returns the failure, it does
 * not decide the reaction).
 */
export type ProbeResult = ProbeOk | ProbeFail;

/**
 * The narrowed opencode SDK client surface the probe uses. The full
 * `OpencodeClient` is a superset (structurally assignable to this
 * interface — `Config.providers()` returns `RequestResult<
 * ConfigProvidersResponses, unknown, ...>` whose success `data` carries
 * `providers: Provider[]` where each `Provider.models` is
 * `Record<string, Model>`, assignable to the narrowed per-provider shape
 * below; `Config.get()` returns `RequestResult<ConfigGetResponses, ...>`
 * whose success `data` IS the `Config` type, assignable to the narrowed
 * `{ model?; small_model? }` below), so the real `createOpencodeClient`
 * satisfies this type; tests inject a stub returning only these two
 * methods. The `error?` fields carry the SDK's `RequestResult` error
 * payload (present when a non-2xx response resolves without throwing in
 * `ThrowOnError=false` mode) so `probe()` can build `ProbeFail.message`
 * from it instead of a generic string.
 *
 * @internal Exported for tests only (used by `model-probe.test.ts`,
 * `yes-selection.test.ts`, and `install.test.ts` — the `ProbeDeps`
 * `createClient` callback type). Not re-exported from the module barrel
 * — consumed directly by co-located test files.
 */
export interface ProbeClient {
  /** Enumerate the user's providers and their models. */
  readonly config: {
    /**
     * List all providers (`client.config.providers()`, URL
     * `/config/providers`). The success `.data` is
     * `{ providers, default }` where each provider's `models` is
     * `Record<string, Model>` using the canonical `Model` type
     * (narrowed here to the only field the probe reads).
     */
    providers(): Promise<{
      readonly data?: {
        readonly providers?: ReadonlyArray<{
          readonly models?: Record<string, Model>;
        }>;
        readonly default?: Readonly<Record<string, string>>;
      };
      readonly error?: unknown;
    }>;
    /**
     * Get config info (`client.config.get()`, URL `/config`). The success
     * `.data` is the opencode `Config` type, narrowed here to the two
     * optional default fields the probe reads.
     */
    get(): Promise<{
      readonly data?: {
        readonly model?: string;
        readonly small_model?: string;
      };
      readonly error?: unknown;
    }>;
  };
}

/** Optional dependencies of {@link probe}, used to inject test doubles. */
export interface ProbeDeps {
  /**
   * Override the SDK's `createOpencodeServer` (used by tests to inject a
   * stub server that returns a canned `url`/`close`, or to throw). Defaults
   * to the real `createOpencodeServer`.
   */
  readonly createServer?: typeof createOpencodeServer;
  /**
   * Override the SDK's `createOpencodeClient` (used by tests to inject a
   * stub {@link ProbeClient}). Defaults to the real `createOpencodeClient`,
   * which returns the full `OpencodeClient` (a superset of `ProbeClient`).
   */
  readonly createClient?: (opts: { baseUrl: string }) => ProbeClient;
}

/**
 * Render an unknown SDK/server error into a stable string for
 * {@link ProbeFail}.message.
 *
 * The SDK's `RequestResult` `error` field (and thrown exceptions)
 * surface untyped. This helper prefers `Error.message`, then a string
 * fast-path, then a JSON serialization (guarded against circular
 * structures), so the wizard warning always carries something
 * actionable instead of `[object Object]` or `undefined`. Used both in
 * the undefined-data branch (carrying `providersRes.error` /
 * `configRes.error`) and in the `catch` block (so the two
 * error-to-string conversions stay DRY).
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Handle the results of `client.config.providers()` and
 * `client.config.get()`.
 *
 * On success (both `.data` defined), flattens provider models into a
 * `Model[]` and picks the `model`/`small_model` defaults. On failure
 * (either `.data` is undefined), returns a `{ ok: false, kind:
 * 'server-start' }` carrying the SDK's `.error` payload when present.
 */
function handleProviderResults(
  providersData: NonNullable<Awaited<ReturnType<ProbeClient['config']['providers']>>['data']>,
  configData: NonNullable<Awaited<ReturnType<ProbeClient['config']['get']>>['data']>,
): ProbeResult {
  const models: Model[] = [];
  for (const provider of providersData.providers ?? []) {
    for (const model of Object.values(provider.models ?? {})) {
      models.push(model);
    }
  }
  if (models.length === 0) {
    return {
      ok: false,
      kind: 'zero-models',
      message: 'no models reachable from the configured providers',
    };
  }
  const defaults: { model?: string; small_model?: string } = {};
  if (configData.model !== undefined) {
    defaults.model = configData.model;
  }
  if (configData.small_model !== undefined) {
    defaults.small_model = configData.small_model;
  }
  return { ok: true, models, defaults };
}

/**
 * Run a headless opencode server on `127.0.0.1:0`, enumerate the models
 * genuinely reachable from the user's configured providers, and read
 * the effective default `model`/`small_model`.
 *
 * The server reads the user's REAL home/config so their real providers
 * and credentials are visible (the probe deliberately does NOT isolate
 * the user's home — unlike the e2e harness's `isolateHome`). It DOES
 * strip the inherited `OPENCODE_SERVER_*` auth env vars for the probe's
 * lifetime so the probe's server is not rejected with `401` when the
 * wizard is run inside a parent opencode session.
 *
 * Teardown is deterministic: `server.close()` + `auth.restore()` are
 * called in a `finally` block on both success and failure.
 *
 * The wizard's graceful-degradation reaction to `ok: false` (warn +
 * skip models + still register the plugin) lives in the caller; the
 * probe returns the structured failure, it does not decide the
 * reaction.
 *
 * @param deps - Optional test doubles for the SDK server/client factories.
 * @returns `ProbeOk` on success, `ProbeFail` on failure (never throws —
 *   all errors are caught and mapped to `ok: false`).
 */
export async function probe(deps: ProbeDeps = {}): Promise<ProbeResult> {
  const createServer = deps.createServer ?? createOpencodeServer;
  const createClient = deps.createClient ?? createOpencodeClient;
  const auth = isolateServerAuth();
  let server: { url: string; close(): void } | null = null;
  try {
    server = await createServer({
      hostname: '127.0.0.1',
      port: 0,
      timeout: 30_000,
    });
    const client = createClient({ baseUrl: server.url });
    const providersRes = await client.config.providers();
    const configRes = await client.config.get();
    if (providersRes.data === undefined || configRes.data === undefined) {
      const err = providersRes.error ?? configRes.error;
      return {
        ok: false,
        kind: 'server-start',
        message:
          err !== undefined && err !== null
            ? describeError(err)
            : 'opencode server returned no payload for providers/config',
      };
    }
    return handleProviderResults(providersRes.data, configRes.data);
  } catch (error) {
    return {
      ok: false,
      kind: 'server-start',
      message: describeError(error),
    };
  } finally {
    server?.close();
    auth.restore();
  }
}
