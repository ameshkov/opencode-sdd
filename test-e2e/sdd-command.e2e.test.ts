/**
 * E2E: the `sdd-command` tool is registered but globally denied. With the
 * plugin loaded, the merged config returned by `client.config.get()` must
 * carry `tools['sdd-command'] === false`, proving the global-deny half of
 * the tool's gating contract takes effect at runtime. The SDD worker agents
 * override this per-agent with `tools['sdd-command'] = true`; the per-agent
 * positive path is covered by the worker e2e suite. The deprecated `tools`
 * field is retained for this deny/override pair because, unlike `permission`,
 * its per-agent override semantics are honoured at runtime for custom tool
 * names (opencode 1.17.x).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pluginConfig, startOpencodeServer, type OpencodeServerHandle } from './harness.js';

describe('sdd-command tool e2e: global deny', () => {
  let server: OpencodeServerHandle;

  beforeAll(async () => {
    server = await startOpencodeServer(pluginConfig());
  });

  afterAll(() => {
    server?.close();
  });

  it('sets tools["sdd-command"] to false in the live merged config', async () => {
    const res = await server.client.config.get();
    expect(res.error, `config.get() errored: ${JSON.stringify(res.error)}`).toBeUndefined();
    expect(res.data).toBeDefined();
    const tools = (res.data ?? {}).tools as Record<string, boolean> | undefined;
    expect(tools?.['sdd-command']).toBe(false);
  });
});
