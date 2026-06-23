import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Vitest config for the e2e suite.
 *
 * Runs everything under `test-e2e/`, both the standalone mock unit test and
 * the binary-dependent `.e2e.test.ts` files. Generous timeouts because each
 * test spawns its own opencode server (5-10s startup). The `globalSetup` fails
 * loudly if the `opencode` binary or plugin build is missing.
 */
export default defineConfig({
  test: {
    include: ['test-e2e/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    globalSetup: ['./test-e2e/global-setup.ts'],
  },
});
