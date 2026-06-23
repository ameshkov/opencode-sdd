import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, pluginConfig, withOpencodeServer } from './harness.js';

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
  it('registers every shipped command', async () => {
    await withOpencodeServer(pluginConfig(), async (client) => {
      const res = await client.command.list();
      const names = (res.data ?? []).map((command) => command.name).sort();

      for (const expected of shippedCommandNames()) {
        expect(names, `missing command: ${expected}`).toContain(expected);
      }
    });
  });

  it('keeps client.config.get() reachable (no references 400)', async () => {
    // Reference registration (which 400'd config.get()) was removed in favor
    // of runtime absolute-path template rewriting. config.get() must now
    // return 200 with the plugin loaded.
    await withOpencodeServer(pluginConfig(), async (client) => {
      const res = await client.config.get();
      expect(res.error, `config.get() errored: ${JSON.stringify(res.error)}`).toBeUndefined();
      expect(res.data).toBeDefined();
    });
  });
});
