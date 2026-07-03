import { configDefaults, defineConfig } from 'vitest/config';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Vitest config for the e2e suite.
 *
 * Runs everything under `test-e2e/`, both the standalone mock unit test and
 * the binary-dependent `.e2e.test.ts` files. Generous timeouts because each
 * file spawns its own opencode server. Startup is fast on Linux/macOS but,
 * on a loaded Windows CI runner, a cold start plus the first command on a
 * freshly spawned server can approach two minutes once the ~9 e2e files run
 * in parallel and over-subscribe the runner's cores. The timeouts are set
 * well above that worst case, and file parallelism is disabled on Windows so
 * each server starts and warms uncontended (Linux/macOS keep parallelism and
 * their fast startup, so the suite stays quick there). The `globalSetup`
 * fails loudly if the `opencode` binary or plugin build is missing.
 */
export default defineConfig({
  test: {
    include: ['test-e2e/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    fileParallelism: !IS_WINDOWS,
    globalSetup: ['./test-e2e/global-setup.ts'],
  },
});
