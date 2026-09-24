import { requireBuild } from '../shared/harness.js';

/**
 * V2 lane preflight: fail loudly when the compiled plugin is missing.
 *
 * The `opencode2` binary is deliberately NOT required here: the in-process
 * lane runs without it, and the loader-smoke test skips itself (with a clear
 * message) when the binary is absent.
 */
export default function setup(): void {
  requireBuild();
}
