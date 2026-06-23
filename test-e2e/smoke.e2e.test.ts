/**
 * Smoke tests: the plugin loads cleanly in a live opencode server. Verifies
 * two load-time invariants unit tests cannot — that every shipped command is
 * discoverable via `client.command.list()`, and that `client.config.get()`
 * stays reachable with the plugin loaded. The latter guards the runtime
 * absolute-path template-rewriting approach, which replaced the
 * reference-registration code that previously caused a hard HTTP 400 on
 * `config.get()` (references are a boot-populated state, not fed by the
 * `config` hook, and the registered object lacked the required `type:
 * "local"` discriminator).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  REPO_ROOT,
  pluginConfig,
  startOpencodeServer,
  type OpencodeServerHandle,
} from './harness.js';

/**
 * The exact set of commands shipped in the build. Derived from the built
 * `commands/markdown` directory so the test stays in sync with whatever is
 * compiled — adding a command automatically covers it here.
 */
function shippedCommandNames(): string[] {
  const dir = join(REPO_ROOT, 'build', 'commands', 'markdown');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.slice(0, -'.md'.length))
    .sort();
}

describe('smoke: plugin loads in a live opencode server', () => {
  // Both smoke tests only need a loaded plugin, so they share a single
  // opencode server across the describe block. This amortizes the slow server
  // startup (which on a loaded Windows CI runner can approach the per-test
  // timeout) instead of paying it twice.
  let server: OpencodeServerHandle;

  beforeAll(async () => {
    server = await startOpencodeServer(pluginConfig());
  });

  afterAll(() => {
    server?.close();
  });

  it('registers every shipped command', async () => {
    const res = await server.client.command.list();
    const names = (res.data ?? []).map((command) => command.name).sort();

    for (const expected of shippedCommandNames()) {
      expect(names, `missing command: ${expected}`).toContain(expected);
    }
  });

  it('keeps client.config.get() reachable (no references 400)', async () => {
    // Reference registration (which 400'd config.get()) was removed in favor
    // of runtime absolute-path template rewriting. config.get() must now
    // return 200 with the plugin loaded.
    const res = await server.client.config.get();
    expect(res.error, `config.get() errored: ${JSON.stringify(res.error)}`).toBeUndefined();
    expect(res.data).toBeDefined();
  });
});
