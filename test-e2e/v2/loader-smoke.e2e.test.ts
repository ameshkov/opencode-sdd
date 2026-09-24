/**
 * V2 loader smoke against the real `opencode2` binary.
 *
 * V2 loads plugins when a location/instance boots (a session or `run`), not
 * when `serve` starts — so this smoke triggers a `run`, which makes the host
 * decode the dual default export, call `setup(ctx)`, and register the SDD
 * surface. The plugin's V2 logger writes to stderr, which `--print-logs`
 * forwards; the assertions read those registration lines.
 *
 * Skips (rather than fails) when `opencode2` is not on PATH: the in-process
 * lane covers behavior without the binary, and CI installs `@opencode/cli`
 * for this lane.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockLlm, type MockLlmState } from '../shared/mock-server.js';
import { isolateHome, isolateServerAuth } from '../shared/harness.js';
import {
  opencode2Available,
  removeProjectDir,
  runOpencode2,
  tempProjectDir,
  v2LoaderConfig,
} from './harness.js';

/** How long the real binary may take to boot, run, and exit. */
const RUN_TIMEOUT_MS = 120_000;

describe('V2 loader smoke (real opencode2 binary)', () => {
  let mock: MockLlmState;
  let projectDir: string;

  beforeAll(async () => {
    mock = await createMockLlm([]);
    projectDir = tempProjectDir();
    writeFileSync(
      join(projectDir, 'opencode.json'),
      JSON.stringify(v2LoaderConfig(`${mock.url}/v1`)),
    );
  });

  afterAll(() => {
    mock.close();
    removeProjectDir(projectDir);
  });

  it.skipIf(!opencode2Available())(
    'loads the plugin and registers the full SDD surface',
    async () => {
      const home = isolateHome();
      const auth = isolateServerAuth();
      try {
        const result = await runOpencode2(['run', 'hello', '--standalone', '--print-logs'], {
          cwd: projectDir,
          // opencode2 resolves its project from `PWD`, not the process cwd:
          // a spawn with only `cwd` boots the parent's project instead.
          env: { ...process.env, PWD: projectDir },
          timeoutMs: RUN_TIMEOUT_MS,
        });
        const output = `${result.stdout}\n${result.stderr}`;

        expect(result.status, output).toBe(0);
        expect(output).toContain('opencode-sdd: info: plugin loading');
        expect(output).toContain('opencode-sdd: info: SDD agents registered {"count":6}');
        expect(output).toContain('opencode-sdd: info: SDD commands registered {"count":11}');
        expect(output).toContain('opencode-sdd: info: sdd-command tool registered');
      } finally {
        auth.restore();
        home.restore();
      }
    },
    RUN_TIMEOUT_MS + 30_000,
  );
});
