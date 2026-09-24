import type { OpencodeHost } from './prerequisites.js';
import { probe, type ProbeDeps, type ProbeResult } from './model-probe.js';
import { probeV2, type V2ProbeDeps } from './v2-model-probe.js';

/**
 * Dependency injection accepted by {@link probeForHost}: the union of the V1
 * and V2 probe hooks. Tests inject only the hooks of the host under test.
 */
export type HostProbeDeps = ProbeDeps & V2ProbeDeps;

/**
 * Probe the detected host for available models.
 *
 * Dispatches to the V1 SDK probe (`createOpencodeServer`) or the V2
 * spawn-and-fetch probe. Failure always stays soft: the caller degrades to
 * writing no model assignments.
 *
 * @param host - Detected host line.
 * @param deps - Optional dependency injection.
 * @returns Models plus defaults, or a typed failure.
 */
export async function probeForHost(
  host: OpencodeHost,
  deps: HostProbeDeps = {},
): Promise<ProbeResult> {
  return host === 'v2' ? probeV2(deps) : probe(deps);
}
