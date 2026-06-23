import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Vitest config for the e2e suite.
 *
 * Runs everything under `test-e2e/`, both the standalone mock unit test and
 * the binary-dependent `.e2e.test.ts` files. Generous timeouts because each
 * test spawns its own opencode server. Startup is fast on Linux/macOS but can
 * exceed 60s on a loaded Windows CI runner, so the timeout is set well above
 * the worst observed startup to avoid platform flakiness. The `globalSetup`
 * fails loudly if the `opencode` binary or plugin build is missing.
 */
export default defineConfig({
  test: {
    include: ['test-e2e/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ['./test-e2e/global-setup.ts'],
  },
});
