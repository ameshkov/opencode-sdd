/**
 * Vitest `globalSetup` for the e2e suite.
 *
 * Runs once before any test file: fails loudly (non-zero exit, clear message)
 * if the `opencode` binary is missing or the plugin build is absent. This
 * keeps per-test failures meaningful instead of cascading into opaque spawn
 * errors.
 */
import { requireBuild, requireOpencodeBinary } from './harness.js';

export default function setup(): void {
  requireOpencodeBinary();
  requireBuild();
}
