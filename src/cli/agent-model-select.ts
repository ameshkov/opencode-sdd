import { select } from '@inquirer/prompts';
import type { Model } from '@opencode-ai/sdk';
import { rankFor, type AgentRecommendation } from './recommend.js';

/**
 * One choice in the per-agent model `select` prompt.
 *
 * `value` carries the full `Model` object so `select` returns the
 * chosen model directly (no path-lookup round-trip). `name` is the
 * display string with a ` [recommended]` badge suffix when the model
 * matched at least one of the agent's keywords. `recommended` is
 * surfaced as an explicit field so tests can assert on the badge
 * without parsing the `name` string.
 *
 * @internal Exported for the {@link AgentModelSelectDeps} type
 * signature (the `selectAgentModel` callback's `choices` parameter
 * references this interface). Not re-exported from the module barrel.
 */
export interface AgentModelChoice {
  /** The model returned by `select` on selection. */
  readonly value: Model;
  /** Display string (`provider/id` + `[recommended]` badge when matched). */
  readonly name: string;
  /** `true` when the model matched at least one keyword (for assertions). */
  readonly recommended: boolean;
}

/**
 * Optional dependencies of {@link promptAgentModel}. Mirrors the
 * `TargetSelectDeps` pattern in `target-select.ts`: a single
 * injectable `selectAgentModel` function used by tests to stub the
 * `@inquirer/prompts select` call without touching a real TTY.
 * Defaults to the real `select`.
 */
export interface AgentModelSelectDeps {
  /** Override the prompt call (used by tests). Defaults to `select`. */
  readonly selectAgentModel?: (config: {
    message: string;
    choices: readonly AgentModelChoice[];
  }) => Promise<Model>;
}

/** Badge suffix appended to the display name of recommended models. */
const RECOMMENDED_BADGE = ' [recommended]';

/**
 * Build the inquirer `choices` list for one subagent by calling
 * {@link rankFor}: recommended models appear FIRST sorted by the
 * declaration-order index of their `matchedKeyword` (earlier keyword
 * = higher rank), non-recommended follow in input order. Each choice's
 * `name` is `provider/id` with a ` [recommended]` badge suffix when
 * `recommended === true`.
 */
function buildChoices(
  models: readonly Model[],
  recommendation: AgentRecommendation,
): AgentModelChoice[] {
  const ranked = rankFor(recommendation, models);
  return ranked.map(({ model, recommended }) => ({
    value: model,
    name: `${model.providerID}/${model.id}${recommended ? RECOMMENDED_BADGE : ''}`,
    recommended,
  }));
}

/**
 * Prompt the user to pick a model for one SDD subagent via
 * `@inquirer/prompts select`. Recommended models are sorted first by
 * keyword declaration order and badged with ` [recommended]`.
 *
 * Returns the chosen `Model`, or `null` when:
 *  - `models` is empty (no prompt is shown — the caller emits an
 *    `unset` warning), or
 *  - the user cancels via Ctrl-C (ExitPromptError narrowed by
 *    `error.name`; the caller treats this as `unset` for that agent).
 *
 * Any other failure (broken TTY, aborted stdin, ...) is rethrown so
 * `main`'s top-level guard surfaces it as a non-zero exit (mirrors
 * `promptTarget`'s error-narrowing policy).
 *
 * @param agent The shipped SDD subagent name (e.g. `sdd-planner`).
 * @param models The probe's enumerated `Model[]` (already deduplicated).
 * @param recommendation The matching entry from `SUBAGENT_RECOMMENDATIONS`.
 * @param deps Optional test double for the `select` call.
 */
export async function promptAgentModel(
  agent: string,
  models: readonly Model[],
  recommendation: AgentRecommendation,
  deps: AgentModelSelectDeps = {},
): Promise<Model | null> {
  if (models.length === 0) {
    return null;
  }
  const selectAgentModel = deps.selectAgentModel ?? select;
  try {
    return await selectAgentModel({
      message: `Select a model for ${agent}:`,
      choices: buildChoices(models, recommendation),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      return null;
    }
    throw error;
  }
}
