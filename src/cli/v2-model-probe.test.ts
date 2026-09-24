import { describe, expect, it, vi } from 'vitest';
import { probeV2, type V2ProbeDeps, type V2ServerHandle } from './v2-model-probe.js';

/** A model catalog response body. */
function modelsResponse(entries: Array<Record<string, unknown>>): unknown {
  return { location: { directory: '/tmp' }, data: entries };
}

/** A default-model response body. */
function defaultResponse(entry: Record<string, unknown> | null): unknown {
  return { location: { directory: '/tmp' }, data: entry };
}

/** Build injected deps around a scripted fetch implementation. */
function depsWith(
  fetchJson: (url: string, headers: Readonly<Record<string, string>>) => Promise<unknown>,
  overrides: Partial<V2ProbeDeps> = {},
): { deps: V2ProbeDeps; close: ReturnType<typeof vi.fn>; spawn: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const spawn = vi.fn(
    async (): Promise<V2ServerHandle> => ({ url: 'http://127.0.0.1:9999', close }),
  );
  return {
    close,
    spawn,
    deps: {
      spawnServe: spawn,
      fetchJson,
      createPassword: () => 'test-password',
      maxModelAttempts: 3,
      retryDelayMs: 0,
      ...overrides,
    },
  };
}

describe('probeV2', () => {
  it('returns mapped models and the default model reference', async () => {
    const { deps } = depsWith(async (url) => {
      if (url.endsWith('/api/model')) {
        return modelsResponse([
          { modelID: 'mock-model', providerID: 'mock', name: 'Mock' },
          { id: 'second', providerID: 'other' },
        ]);
      }
      return defaultResponse({ modelID: 'mock-model', providerID: 'mock' });
    });

    const result = await probeV2(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models.map((model) => `${model.providerID}/${model.id}`)).toEqual([
      'mock/mock-model',
      'other/second',
    ]);
    expect(result.models[1]?.name).toBe('second');
    expect(result.defaults).toEqual({ model: 'mock/mock-model' });
  });

  it('polls until the model catalog is populated', async () => {
    let calls = 0;
    const { deps } = depsWith(async (url) => {
      if (!url.endsWith('/api/model')) {
        return defaultResponse(null);
      }
      calls += 1;
      return calls < 3 ? modelsResponse([]) : modelsResponse([{ modelID: 'm', providerID: 'p' }]);
    });

    const result = await probeV2(deps);

    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('fails with zero-models when the catalog stays empty', async () => {
    const { deps, close } = depsWith(async (url) =>
      url.endsWith('/api/model') ? modelsResponse([]) : defaultResponse(null),
    );

    const result = await probeV2(deps);

    expect(result).toEqual({
      ok: false,
      kind: 'zero-models',
      message: 'no models reachable from the configured providers',
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails with server-start when the spawn rejects and still closes nothing', async () => {
    const spawn = vi.fn(async () => {
      throw new Error('spawn ENOENT');
    });
    const result = await probeV2({ spawnServe: spawn, fetchJson: vi.fn() });

    expect(result).toEqual({ ok: false, kind: 'server-start', message: 'spawn ENOENT' });
  });

  it('fails with server-start when the API request fails', async () => {
    const { deps, close } = depsWith(async () => {
      throw new Error('HTTP 401');
    });

    const result = await probeV2(deps);

    expect(result).toEqual({ ok: false, kind: 'server-start', message: 'HTTP 401' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('passes the generated password to the spawn and uses it for Basic auth', async () => {
    const seen: Array<{ password: string; headers: Readonly<Record<string, string>> }> = [];
    const close = vi.fn();
    const spawnServe = vi.fn(async (password: string) => {
      seen.push({ password, headers: {} });
      return { url: 'http://127.0.0.1:9999', close };
    });
    const fetchJson = vi.fn(async (_url: string, headers: Readonly<Record<string, string>>) => {
      seen[0]!.headers = headers;
      return modelsResponse([{ modelID: 'm', providerID: 'p' }]);
    });

    await probeV2({
      spawnServe,
      fetchJson,
      createPassword: () => 'generated-secret',
      maxModelAttempts: 1,
    });

    expect(seen[0]?.password).toBe('generated-secret');
    expect(seen[0]?.headers['authorization']).toBe(
      `Basic ${Buffer.from('opencode:generated-secret').toString('base64')}`,
    );
  });

  it('ignores malformed model entries', async () => {
    const { deps } = depsWith(async (url) =>
      url.endsWith('/api/model')
        ? modelsResponse([{ name: 'no id' }, { modelID: 'ok', providerID: 'p' }])
        : defaultResponse(null),
    );

    const result = await probeV2(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models).toHaveLength(1);
    expect(result.defaults).toEqual({});
  });
});
