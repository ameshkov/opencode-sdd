/**
 * E2E: user-set agent `model` (e.g. from `opencode.json`'s `config.agent`)
 * survives plugin registration. `registerAgents` merges the plugin's
 * per-agent entry onto any existing user config instead of replacing it
 * (the plugin's parsed config carries no `model`, so a plain replace
 * would clobber a user override). Here we boot a real opencode server
 * with an SDD agent pinned to a custom model and assert the pin survives
 * via `client.config.get()`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pluginConfig, startOpencodeServer, type OpencodeServerHandle } from './harness.js';

import type { Config } from '@opencode-ai/sdk';

/**
 * The model string a user would pin an SDD agent to. Needs to be a valid
 * provider/model id shape so opencode accepts the config; it is never sent
 * to a model here (no session is run), only stored and read back.
 */
const USER_MODEL = 'mock/pinned-model';

describe('e2e: user agent model override survives plugin load', () => {
  let server: OpencodeServerHandle;

  beforeAll(async () => {
    // A user (or opencode.json) pins `sdd-explore` to a specific model before
    // the plugin registers its own definition for the same agent name.
    const config = pluginConfig({
      agent: { 'sdd-explore': { model: USER_MODEL } },
    } satisfies Config);
    server = await startOpencodeServer(config);
  });

  afterAll(() => {
    server?.close();
  });

  it('preserves the user-set model on sdd-explore after plugin registration', async () => {
    const res = await server.client.config.get();
    expect(res.error, `config.get() errored: ${JSON.stringify(res.error)}`).toBeUndefined();
    const agents = (res.data?.agent ?? {}) as Record<string, { model?: string; mode?: string }>;

    const explore = agents['sdd-explore'];
    expect(explore, 'sdd-explore should be registered').toBeDefined();
    // The plugin fills in its own description/mode/permission/prompt, but a
    // user-set `model` (which the plugin does not define) must survive.
    expect(explore?.model, 'user-set model was clobbered by plugin registration').toBe(USER_MODEL);
    // And the plugin's own fields still land.
    expect(explore?.mode).toBe('subagent');
  });
});
