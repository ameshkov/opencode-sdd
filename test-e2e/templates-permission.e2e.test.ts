/**
 * E2E: the plugin's `config` hook mutates `config.permission.external_directory`
 * to grant read access to the bundled templates directory. With the plugin
 * loaded, the merged config returned by `client.config.get()` must carry a
 * `<templates-dir>/**` -> "allow" rule under `permission.external_directory`.
 * This proves the config-hook permission patch is accepted and retained by
 * opencode at runtime (not just in the plugin's own unit tests), mirroring the
 * `sdd-command` global-deny e2e assertion, which checks the sibling
 * `permission['sdd-command']` rule the same hook writes.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  REPO_ROOT,
  pluginConfig,
  startOpencodeServer,
  type OpencodeServerHandle,
} from './harness.js';

describe('bundled templates external_directory permission e2e', () => {
  let server: OpencodeServerHandle;

  beforeAll(async () => {
    server = await startOpencodeServer(pluginConfig());
  });

  afterAll(() => {
    server?.close();
  });

  it('grants a templates-dir allow-rule in the live merged config', async () => {
    // The plugin loads from build/index.js, so resolveTemplatesDir() points
    // at <repo>/build/assets/commands/templates. A stale build (missing the
    // templates dir) would make the granted glob point at nothing, so guard.
    const templatesDir = join(REPO_ROOT, 'build', 'assets', 'commands', 'templates');
    expect(existsSync(templatesDir), `templates dir missing: ${templatesDir}`).toBe(true);

    const res = await server.client.config.get();
    expect(res.error, `config.get() errored: ${JSON.stringify(res.error)}`).toBeUndefined();
    expect(res.data).toBeDefined();

    const permission = (res.data ?? {}).permission as Record<string, unknown> | undefined;
    expect(permission, 'permission missing from merged config').toBeDefined();
    const externalDirectory = permission?.external_directory as Record<string, string> | undefined;
    expect(externalDirectory, 'permission.external_directory missing').toBeDefined();

    const expectedGlob = `${templatesDir}/**`;
    expect(externalDirectory?.[expectedGlob], `expected allow-rule for ${expectedGlob}`).toBe(
      'allow',
    );
  });
});
