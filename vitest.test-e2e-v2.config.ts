import { configDefaults, defineConfig } from 'vitest/config';

const IS_WINDOWS = process.platform === 'win32';

/**
 * V2 e2e lane: the in-process `@opencode/sdk` specs plus the real-`opencode2`
 * loader smoke. The in-process specs need only a built `build/`; the loader
 * smoke skips itself when the `opencode2` binary is absent.
 */
export default defineConfig({
  test: {
    include: ['test-e2e/v2/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    fileParallelism: !IS_WINDOWS,
    globalSetup: ['./test-e2e/v2/global-setup.ts'],
  },
});
