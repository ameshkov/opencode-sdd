import { probe, type ProbeDeps } from './model-probe.js';
import { rankFor, SUBAGENT_RECOMMENDATIONS } from './recommend.js';
import {
  AGENT_UNSET_WARNING,
  formatModelValue,
  PROBE_FAILED_WARNING,
  type YesSelectionResult,
} from './yes-selection.js';
import { promptAgentModel, type AgentModelSelectDeps } from './agent-model-select.js';

/**
 * The result of {@link buildInteractiveSelection} — structurally
 * identical to {@link YesSelectionResult} so `main` consumes both
 * flows (interactive and `--yes`) via the same warnings → stderr +
 * apply-with-patch path. Aliased rather than redefined to keep the
 * shape in one place (DRY).
 */
export type InteractiveSelectionResult = YesSelectionResult;

/**
 * Optional prompt-level dependencies of
 * {@link buildInteractiveSelection}, used to inject test doubles for
 * the per-agent `select` call. Mirrors `AgentModelSelectDeps` so the
 * same stub shape flows through the orchestrator to
 * {@link promptAgentModel}.
 */
export type InteractivePromptDeps = AgentModelSelectDeps;

/**
 * Build the per-subagent model {@link YesSelectionResult.selection} for
 * the INTERACTIVE flow (the default path when `--yes` is NOT passed) by
 * composing the Model Probe, the Recommendation Engine's `rankFor`,
 * the per-agent {@link promptAgentModel} wrapper, and
 * `formatModelValue` (which renders `provider/model`).
 *
 * Sequence: `probe()` -> on `ProbeOk`, for each
 * `SUBAGENT_RECOMMENDATIONS` entry: `rankFor` to sort the agent's
 * candidates (recommended first, by keyword declaration order), then
 * `promptAgentModel` to ask the user. Each chosen model is formatted
 * as `` `${providerID}/${id}` `` and added to the map. A per-agent
 * cancel (Ctrl-C -> `null`) or an empty ranked list emits an
 * {@link AGENT_UNSET_WARNING} and skips that agent (the wizard never
 * guesses).
 *
 * Graceful degradation: on `ProbeFail`, returns an empty `Selection`
 * + a single {@link PROBE_FAILED_WARNING} + `degraded: true` —
 * identical to `buildYesSelection`'s probe-fail path so `main`'s
 * reaction (register plugin only, warn, exit 0) is uniform across
 * both flows.
 *
 * @param probeDeps Optional test doubles for the SDK server/client
 *   (mirrors `probe`'s `ProbeDeps`).
 * @param promptDeps Optional test doubles for the per-agent `select`.
 */
export async function buildInteractiveSelection(
  probeDeps?: ProbeDeps,
  promptDeps: InteractivePromptDeps = {},
): Promise<InteractiveSelectionResult> {
  const probeResult = await probe(probeDeps);
  if (!probeResult.ok) {
    return {
      selection: {},
      warnings: [PROBE_FAILED_WARNING(probeResult.message)],
      degraded: true,
    };
  }
  const { models } = probeResult;
  const map = new Map<string, string>();
  const warnings: string[] = [];
  for (const recommendation of SUBAGENT_RECOMMENDATIONS) {
    const ranked = rankFor(recommendation, models);
    if (ranked.length === 0) {
      // Defensive: ProbeOk guarantees models.length > 0
      // (zero-models is ProbeFail), so this branch is unreachable in
      // production. Kept for robustness if the filter ever changes.
      warnings.push(AGENT_UNSET_WARNING(recommendation.agent));
      continue;
    }
    const chosen = await promptAgentModel(recommendation.agent, models, recommendation, promptDeps);
    if (chosen === null) {
      warnings.push(AGENT_UNSET_WARNING(recommendation.agent));
    } else {
      map.set(recommendation.agent, formatModelValue(chosen));
    }
  }
  return {
    selection: map.size === 0 ? {} : { models: map },
    warnings,
    degraded: false,
  };
}
