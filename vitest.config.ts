import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Main test config, used by `pnpm test` / `pnpm check`.
 *
 * Excludes the binary-dependent e2e tests (`*.e2e.test.ts`) so the CI gate
 * never requires the `opencode` binary. The standalone mock unit test
 * (`test-e2e/mock-server.test.ts`) still runs here; the full e2e suite runs
 * under `pnpm test:e2e` (see `vitest.test-e2e.config.ts`).
 */
export default defineConfig({
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, 'test-e2e/**/*.e2e.test.ts'],
  },
});
