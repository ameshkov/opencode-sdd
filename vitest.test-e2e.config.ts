import { configDefaults, defineConfig } from 'vitest/config';

const IS_WINDOWS = process.platform === 'win32';

/**
 * V1 e2e lane: the existing spec files plus the V1 harness and the
 * host-neutral shared unit tests. Requires an opencode 1.x binary on PATH and
 * a built `build/` (asserted by the global setup).
 */
export default defineConfig({
  test: {
    include: ['test-e2e/*.e2e.test.ts', 'test-e2e/v1/**/*.test.ts', 'test-e2e/shared/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    fileParallelism: !IS_WINDOWS,
    globalSetup: ['./test-e2e/v1/global-setup.ts'],
  },
});
