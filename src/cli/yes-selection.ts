import type { Model } from '@opencode-ai/sdk';
import { probe, type ProbeDeps } from './model-probe.js';
import { autoSelect, SUBAGENT_RECOMMENDATIONS, type AgentSelection } from './recommend.js';
import type { Selection } from './config-patcher.js';

/**
 * Format a matched model as the `provider/model` string opencode stores
 * in `agent.<name>.model`.
 *
 * Resolution path (verified against the SDK's `Model` type in
 * `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`):
 *   - `Config.model` / `Config.small_model` JSDoc states the format is
 *     `provider/model` (e.g. `anthropic/claude-2`).
 *   - `Model` has exactly two identifying fields: non-optional
 *     `providerID` and non-optional `id`; there is NO combined field,
 *     so the recipe is concatenation.
 *   - The fallback path's `value` is already in this exact format (read
 *     verbatim from `defaults.model` / `defaults.small_model`), so the
 *     `recommended` and `fallback` paths produce format-identical
 *     strings.
 *
 * @internal Exported for tests only (pinned by a direct unit test in
 * `yes-selection.test.ts` to lock the recipe). Not re-exported from
 * the module barrel — consumed directly by co-located test files.
 */
export function formatModelValue(model: Model): string {
  return `${model.providerID}/${model.id}`;
}

/** The result of {@link buildYesSelection}. */
export interface YesSelectionResult {
  /** The per-subagent model map (possibly empty on probe failure or all-unset). */
  readonly selection: Selection;
  /** Human-readable warning lines (probe failure, per-unset-agent). Emitted to stderr. */
  readonly warnings: readonly string[];
  /** `true` when the probe returned ProbeFail (graceful degradation). */
  readonly degraded: boolean;
}

/**
 * Warning emitted when the probe fails (under `--yes` and under the
 * interactive flow). The shared wording is pinned by
 * `yes-selection.test.ts` and `interactive-selection.test.ts`.
 *
 * @internal Shared with `interactive-selection.ts` to keep the
 * probe-failure wording DRY across both flows. Not re-exported from the
 * module barrel — consumed directly by co-located test files and
 * `interactive-selection.ts`.
 */
export const PROBE_FAILED_WARNING = (message: string): string =>
  `install: model step skipped (probe failed: ${message}); the plugin is registered without per-subagent model assignments.`;

/**
 * Warning emitted per agent that went `unset` (the wizard never guesses
 * a model). The shared wording is pinned by `yes-selection.test.ts` and
 * `interactive-selection.test.ts`.
 *
 * @internal Shared with `interactive-selection.ts` to keep the
 * per-unset-agent wording DRY across both flows. Not re-exported from
 * the module barrel — consumed directly by co-located test files and
 * `interactive-selection.ts`.
 */
export const AGENT_UNSET_WARNING = (agent: string): string =>
  `install: no recommended model and no applicable default for ${agent}; leaving unset.`;

/**
 * Build the per-subagent model {@link Selection} for the `--yes` flow by
 * composing the Model Probe and the Recommendation Engine, formatting
 * each match as `provider/model`, and emitting warnings on probe
 * failure and per-`unset` agent.
 *
 * Sequence: `probe()` -> on `ProbeOk`, `autoSelect(SUBAGENT_RECOMMENDATIONS,
 * models, defaults)` -> format each `AgentSelection`:
 *   - `reason: 'recommended'` -> `formatModelValue(model)` added to the map.
 *   - `reason: 'fallback'`   -> `value` added to the map verbatim.
 *   - `status: 'unset'`      -> warning emitted, NO entry added (the
 *                              wizard never guesses a model).
 *
 * Graceful degradation: on `ProbeFail`, returns an empty `Selection`
 * (no models) + a single warning naming the skipped step (carrying
 * the probe's `message`) + `degraded: true`. The plugin entry is still
 * registered (the caller's `computePatch` falls back to the
 * plugin-only patch on an empty Selection).
 *
 * @param probeDeps Optional test doubles for the SDK server/client (mirrors
 *   `probe`'s `ProbeDeps`). Tests inject stubs exactly like
 *   `model-probe.test.ts` does.
 */
export async function buildYesSelection(probeDeps?: ProbeDeps): Promise<YesSelectionResult> {
  const probeResult = await probe(probeDeps);
  if (!probeResult.ok) {
    return {
      selection: {},
      warnings: [PROBE_FAILED_WARNING(probeResult.message)],
      degraded: true,
    };
  }
  const { models, defaults } = probeResult;
  const selections: AgentSelection<Model>[] = autoSelect(
    SUBAGENT_RECOMMENDATIONS,
    models,
    defaults,
  );
  const map = new Map<string, string>();
  const warnings: string[] = [];
  for (const sel of selections) {
    if (sel.status === 'selected') {
      if (sel.reason === 'recommended') {
        map.set(sel.agent, formatModelValue(sel.model));
      } else {
        map.set(sel.agent, sel.value);
      }
    } else {
      warnings.push(AGENT_UNSET_WARNING(sel.agent));
    }
  }
  const selection: Selection = map.size === 0 ? {} : { models: map };
  return { selection, warnings, degraded: false };
}
