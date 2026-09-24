import { describe, expect, it, vi } from 'vitest';
import { probeForHost } from './host-probe.js';

describe('probeForHost', () => {
  it('uses the V1 SDK probe on a v1 host', async () => {
    const close = vi.fn();
    const providers = vi.fn().mockResolvedValue({
      data: {
        providers: [{ models: { 'mock-model': { id: 'mock-model', providerID: 'mock' } } }],
      },
    });

    const result = await probeForHost('v1', {
      createServer: async () => ({ url: 'http://127.0.0.1:0', close }),
      createClient: () =>
        ({
          config: {
            providers,
            get: async () => ({ data: {} }),
          },
        }) as never,
    });

    expect(result.ok).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses the V2 spawn-and-fetch probe on a v2 host', async () => {
    const close = vi.fn();
    const result = await probeForHost('v2', {
      spawnServe: async () => ({ url: 'http://127.0.0.1:9999', close }),
      fetchJson: async (url) =>
        url.endsWith('/api/model')
          ? { data: [{ modelID: 'm', providerID: 'p', name: 'M' }] }
          : { data: null },
      createPassword: () => 'pw',
      maxModelAttempts: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models[0]?.id).toBe('m');
    }
    expect(close).toHaveBeenCalledOnce();
  });
});
