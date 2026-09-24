import { requireBuild } from '../shared/harness.js';
import { requireV1Binary } from './harness.js';

/**
 * V1 lane preflight: fail loudly before any test spawns a server when the
 * opencode 1.x binary or the compiled plugin is missing.
 */
export default function setup(): void {
  requireV1Binary();
  requireBuild();
}
