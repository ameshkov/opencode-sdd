import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Model } from '@opencode-ai/sdk';

import { probe, type ProbeClient, type ProbeResult } from './model-probe.js';

const AUTH_KEYS = ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME'] as const;

afterEach(() => {
  for (const key of AUTH_KEYS) {
    delete process.env[key];
  }
});

/**
 * Build a complete `Model`-shaped stub object (all required fields
 * populated with sensible defaults) so the stubbed
 * `client.config.providers()` response satisfies
 * `Provider.models: Record<string, Model>` and `pnpm typecheck` passes.
 * The critical finding this revision addresses: the SDK's canonical
 * `Model` type requires `providerID`, `api`, nested `capabilities`,
 * non-optional `cost` / `limit` / `status` / `options` / `headers`; partial
 * `{ id, name, ... }` objects do NOT satisfy it. Override any field via
 * `overrides`.
 */
function modelStub(overrides: Partial<Model> & { id: string; providerID: string }): Model {
  return {
    id: overrides.id,
    providerID: overrides.providerID,
    api: overrides.api ?? {
      id: 'stub-api',
      url: 'http://stub',
      npm: '@stub/api',
    },
    name: overrides.name ?? overrides.id,
    capabilities: overrides.capabilities ?? {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
    },
    cost: overrides.cost ?? {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: overrides.limit ?? { context: 128_000, output: 4_096 },
    status: overrides.status ?? 'active',
    options: overrides.options ?? {},
    headers: overrides.headers ?? {},
  };
}

/**
 * Build a stub ProbeClient returning a canned model list + defaults.
 * The stub mirrors the SDK's `client.config.providers()` surface (NOT
 * `client.provider.list()`): the real `Provider.models` is
 * `Record<string, Model>` using the canonical `Model` type, so the stub
 * must too. `onProviders` (if provided) is called inside
 * `config.providers()` so a test can capture `process.env` at call time
 * (proving auth was stripped during the probe).
 */
function stubClient(
  models: Record<string, Model>,
  defaults: { model?: string; small_model?: string },
  onProviders?: () => void,
): ProbeClient {
  return {
    config: {
      providers: async () => {
        onProviders?.();
        return {
          data: {
            providers: [{ id: 'stub-provider', name: 'Stub', models }],
            default: {},
          },
        };
      },
      get: async () => ({ data: defaults }),
    },
  };
}

describe('probe', () => {
  it('returns ok + flattened models + picked defaults on success', async () => {
    const models: Record<string, Model> = {
      'deepseek-chat': modelStub({
        id: 'deepseek-chat',
        providerID: 'stub-provider',
        name: 'DeepSeek Chat',
      }),
      'claude-3': modelStub({
        id: 'claude-3',
        providerID: 'stub-provider',
        name: 'Claude 3',
      }),
    };
    const close = vi.fn();
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:9999',
        close,
      }),
      createClient: () =>
        stubClient(models, {
          model: 'stub-provider/claude-3',
          small_model: 'stub-provider/deepseek-chat',
        }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Models are flattened from providers[].models
      // (Record<string, Model>) into an array, preserving the SDK's full
      // canonical Model shape.
      expect(result.models).toHaveLength(2);
      expect(result.models.map((m) => m.id).sort()).toEqual(['claude-3', 'deepseek-chat']);
      // Defaults are picked from config.get()'s .data.
      expect(result.defaults.model).toBe('stub-provider/claude-3');
      expect(result.defaults.small_model).toBe('stub-provider/deepseek-chat');
    }
    // Deterministic teardown: server.close() was called.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns ok with empty defaults when model/small_model are unset', async () => {
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: vi.fn(),
      }),
      createClient: () =>
        stubClient(
          {
            m1: modelStub({ id: 'm1', providerID: 'p', name: 'M1' }),
          },
          {},
        ),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models).toHaveLength(1);
      expect(result.defaults).toEqual({});
    }
  });

  it('returns ok:false kind:server-start when createServer throws', async () => {
    const result = await probe({
      createServer: async () => {
        throw new Error('opencode binary not found');
      },
      createClient: () => stubClient({}, {}),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('server-start');
      expect(result.message).toContain('opencode binary not found');
    }
  });

  it('returns ok:false kind:server-start when a client call rejects (catch-all)', async () => {
    const failingClient: ProbeClient = {
      config: {
        // A thrown error from config.providers() lands in the try/catch
        // (distinct from the data===undefined branch below). Auth-conflict
        // (401) and other client-call failures map to the 'server-start'
        // catch-all (indistinguishable from spawn/start failures at the
        // SDK level without fragile error introspection). The message
        // carries the underlying error for the wizard's warning text.
        providers: async () => {
          throw new Error('HTTP 401 Unauthorized');
        },
        get: async () => ({ data: {} }),
      },
    };
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: vi.fn(),
      }),
      createClient: () => failingClient,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('server-start');
      expect(result.message).toContain('401');
    }
  });

  it('returns ok:false kind:server-start with the SDK .error message when providers() returns a non-2xx', async () => {
    // In the SDK's default ThrowOnError=false mode, a non-2xx response
    // resolves WITHOUT throwing to { data: undefined, error }. The probe
    // must carry .error into ProbeFail.message rather than discarding it
    // for a generic string, so the wizard's warning text is actionable.
    const failingClient: ProbeClient = {
      config: {
        providers: async () => ({
          data: undefined,
          error: new Error('HTTP 500 Internal Server Error'),
        }),
        get: async () => ({ data: {} }),
      },
    };
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: vi.fn(),
      }),
      createClient: () => failingClient,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('server-start');
      expect(result.message).toContain('HTTP 500');
    }
  });

  it('returns ok:false kind:server-start carrying configRes.error when only config.get() fails', async () => {
    const failingConfigClient: ProbeClient = {
      config: {
        providers: async () => ({ data: { providers: [] } }),
        get: async () => ({
          data: undefined,
          error: new Error('config read failed: 503'),
        }),
      },
    };
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: vi.fn(),
      }),
      createClient: () => failingConfigClient,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // providersRes.error is undefined (providers() succeeded); the
      // message falls back to configRes.error (the `??` chain in probe()).
      expect(result.kind).toBe('server-start');
      expect(result.message).toContain('config read failed: 503');
    }
  });

  it('returns ok:false kind:server-start with a generic message when data is undefined and .error is absent', async () => {
    const failingClient: ProbeClient = {
      config: {
        providers: async () => ({ data: undefined }),
        get: async () => ({ data: {} }),
      },
    };
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: vi.fn(),
      }),
      createClient: () => failingClient,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('server-start');
      // Neither .error present — falls back to the generic text.
      expect(result.message).toContain('no payload');
    }
  });

  it('returns ok:false kind:zero-models when the server returns no models', async () => {
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: vi.fn(),
      }),
      createClient: () => stubClient({}, { model: 'p/x' }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('zero-models');
    }
  });

  it('strips inherited OPENCODE_SERVER_* during the probe and restores after', async () => {
    process.env.OPENCODE_SERVER_PASSWORD = 'secret-from-parent-session';
    process.env.OPENCODE_SERVER_USERNAME = 'parent-user';

    let sawPasswordDuringProbe: string | undefined;
    let sawUsernameDuringProbe: string | undefined;
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: vi.fn(),
      }),
      createClient: () =>
        stubClient(
          {
            m1: modelStub({ id: 'm1', providerID: 'p', name: 'M1' }),
          },
          {},
          () => {
            // Captured INSIDE config.providers() — during the probe, after
            // isolateServerAuth() has stripped the vars.
            sawPasswordDuringProbe = process.env.OPENCODE_SERVER_PASSWORD;
            sawUsernameDuringProbe = process.env.OPENCODE_SERVER_USERNAME;
          },
        ),
    });

    expect(result.ok).toBe(true);
    // During the probe, the inherited auth vars were stripped.
    expect(sawPasswordDuringProbe).toBeUndefined();
    expect(sawUsernameDuringProbe).toBeUndefined();
    // After the probe, the inherited auth vars were restored (deterministic
    // teardown via auth.restore() in the finally block).
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBe('secret-from-parent-session');
    expect(process.env.OPENCODE_SERVER_USERNAME).toBe('parent-user');
  });

  it('tears down server + auth even on failure (deterministic teardown)', async () => {
    process.env.OPENCODE_SERVER_PASSWORD = 'secret';
    const close = vi.fn();
    const result = await probe({
      createServer: async () => ({
        url: 'http://127.0.0.1:0',
        close,
      }),
      createClient: () => {
        throw new Error('client construction failed');
      },
    });

    expect(result.ok).toBe(false);
    // server.close() was called in the finally block despite the failure.
    expect(close).toHaveBeenCalledTimes(1);
    // auth.restore() was called in the finally block — the inherited
    // auth var was restored despite the failure.
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBe('secret');
  });

  it('exports ProbeResult as a usable type', () => {
    // Type-level smoke: a caller can narrow on `ok` and read the
    // success or failure fields. This pins the discriminated-union
    // shape that `main(argv)` consumes.
    const ok: ProbeResult = {
      ok: true,
      models: [],
      defaults: {},
    };
    const fail: ProbeResult = {
      ok: false,
      kind: 'server-start',
      message: 'boom',
    };
    if (ok.ok) {
      expect(ok.models).toEqual([]);
    }
    if (!fail.ok) {
      expect(fail.kind).toBe('server-start');
    }
  });
});
