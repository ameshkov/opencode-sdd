import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Main test config, used by `pnpm test` / `pnpm check`.
 *
 * Excludes the binary-dependent e2e tests (`*.e2e.test.ts`) so the CI gate
 * never requires the `opencode` binary, plus the generated manual QA output
 * (`qa/evidence/`, `qa/output/`) — QA runs copy scratch projects into those
 * directories, including fixture `*.test.ts` files that are not part of the
 * suite. The standalone mock unit test (`test-e2e/mock-server.test.ts`) still
 * runs here; the full e2e suite runs under `pnpm test:e2e` (see
 * `vitest.test-e2e.config.ts`).
 */
export default defineConfig({
  test: {
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      'test-e2e/**/*.e2e.test.ts',
      'qa/evidence/**',
      'qa/output/**',
    ],
  },
});
