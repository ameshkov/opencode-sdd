/**
 * A model narrowed to the fields the Recommendation Engine ranks on.
 *
 * The engine is intentionally generic over `M extends RecommendableModel`
 * so it stays pure (no `@opencode-ai/*` import — not even type-only) and
 * is fully unit-testable with light `{ id, name }` fixture tables. The
 * Model Probe's full SDK `Model` type (`@opencode-ai/sdk`) has `id:
 * string` and `name: string`, so `Model extends RecommendableModel`
 * structurally — the wizard passes the probe's `Model[]` directly to
 * {@link rankFor}/{@link autoSelect} and gets `RankedModel<Model>`/
 * `AgentSelection<Model>` back, carrying the full `Model` objects (so
 * the wizard can read `model.providerID` to format the `provider/model`
 * agent-model value).
 */
export interface RecommendableModel {
  /** The model id (primary keyword-match target, e.g. `deepseek-chat`). */
  readonly id: string;
  /** The display name (secondary keyword-match target, e.g. `DeepSeek Chat`). */
  readonly name: string;
}

/**
 * A subagent's tier — the SINGLE attribute that drives the auto-select
 * fallback.
 *
 * - `cheap`  falls back to `defaults.small_model` then `defaults.model`.
 * - `strong` falls back to `defaults.model`.
 *
 * There is no separate fallback-chain field; the chain is DERIVED from the
 * tier, so the two can never disagree.
 */
/**
 * @internal Exported for tests only (used by `recommend.test.ts` to build
 * fixture recommendations). Not re-exported from the module barrel —
 * consumed directly by co-located test files.
 */
export type Tier = 'cheap' | 'strong';

/**
 * One entry in the curated per-subagent recommendation table.
 *
 * - `agent` is the shipped SDD subagent name (see `src/assets/agents/`).
 * - `keywords` is an ordered list whose DECLARATION ORDER is the match
 *   priority (earlier keyword = higher priority). A keyword matches
 *   case-insensitively as a substring of a model's `id` (primary) or
 *   `name` (secondary) — see {@link matchesKeyword}.
 * - `tier` drives the fallback in {@link autoSelect}.
 */
export interface AgentRecommendation {
  /** The shipped SDD subagent name (e.g. `sdd-build`). */
  readonly agent: string;
  /**
   * Ordered keyword list. Declaration order IS the priority (earlier =
   * higher). A keyword matches case-insensitively as a substring of a
   * model's `id` (primary) or `name` (secondary) for ranking and badging.
   */
  readonly keywords: readonly string[];
  /**
   * The tier that drives the fallback (`cheap` -> `small_model` then
   * `model`; `strong` -> `model`).
   */
  readonly tier: Tier;
}

/**
 * The curated per-subagent recommendation table — the shipped SDD data the
 * engine ranks against.
 *
 * Tier split: the two read-only researchers (`sdd-explore`,
 * `sdd-plan-reviewer`) are `cheap` (fall back to the user's `small_model`
 * then `model`); the five heavyweight agents (`sdd-build`, `sdd-planner`,
 * `sdd-reviewer`, `sdd-coder`, `sdd-validator`) are `strong` (fall back to
 * `model`). Exactly two are `cheap` and five are `strong`, per the
 * fallback rule.
 *
 * Keywords are model-family substrings matched case-insensitively against
 * a model's `id` (primary) and `name` (secondary). Strong agents prefer
 * capable reasoning/coding families (`deepseek`, `qwen`); cheap agents
 * prefer fast/cheap families (`mimo`, `gemini`). This is the
 * minimum-viable curated set; it is the SINGLE source of truth for
 * keyword updates — the algorithm in this module never references
 * specific families, so the table can be revised by editing only this
 * constant (no algorithm change). The maintainer's update cadence is:
 * edit `SUBAGENT_RECOMMENDATIONS` and ship a new release.
 */
export const SUBAGENT_RECOMMENDATIONS: readonly AgentRecommendation[] = [
  // STRONG (fallback: `model`) — the heavyweight agents.
  { agent: 'sdd-build', keywords: ['deepseek', 'qwen'], tier: 'strong' },
  { agent: 'sdd-planner', keywords: ['deepseek', 'qwen'], tier: 'strong' },
  { agent: 'sdd-reviewer', keywords: ['deepseek', 'qwen'], tier: 'strong' },
  { agent: 'sdd-coder', keywords: ['deepseek', 'qwen'], tier: 'strong' },
  { agent: 'sdd-validator', keywords: ['deepseek', 'qwen'], tier: 'strong' },
  // CHEAP (fallback: `small_model` then `model`) — the read-only researchers.
  { agent: 'sdd-plan-reviewer', keywords: ['mimo', 'gemini'], tier: 'cheap' },
  { agent: 'sdd-explore', keywords: ['mimo', 'gemini'], tier: 'cheap' },
];

/**
 * A candidate model paired with its ranking outcome for one subagent
 * (produced by {@link rankFor}).
 *
 * Recommended models (those matching at least one keyword) appear FIRST in
 * the ranked list, ordered by the declaration-order index of their
 * `matchedKeyword` (earlier keyword = higher rank). Non-recommended models
 * follow in input order. The interactive per-agent prompt reads
 * `recommended` and `matchedKeyword` for badging.
 */
/**
 * @internal Exported for tests only (used by `recommend.test.ts` to assert
 * ranking outcomes). Not re-exported from the module barrel — consumed
 * directly by co-located test files.
 */
export interface RankedModel<M extends RecommendableModel = RecommendableModel> {
  /** The model being ranked (the same object passed to `rankFor`). */
  readonly model: M;
  /** `true` when this model matched at least one of the agent's keywords. */
  readonly recommended: boolean;
  /**
   * The first keyword (in declaration order) that matched this model, for
   * badging in the interactive flow. Omitted when this model matched no
   * keyword (`recommended === false`).
   */
  readonly matchedKeyword?: string;
}

/**
 * The effective default model values the engine reads for the fallback
 * (narrowed to the two fields it consults).
 *
 * Structurally identical to the Model Probe's `ProbeDefaults`
 * (`src/cli/model-probe.ts`), so the wizard passes the probe's
 * `defaults` directly to {@link autoSelect} without any adapter. Defined
 * locally to keep the engine standalone and pure (it imports NOTHING — not
 * even type-only — from `@opencode-ai/*` or any sibling `src/cli/` module).
 */
export interface RecommendDefaults {
  /** The user's configured default `model` (top-level opencode config). */
  readonly model?: string;
  /** The user's configured default `small_model` (top-level opencode config). */
  readonly small_model?: string;
}

/**
 * The auto-select result for one subagent (produced by {@link autoSelect}).
 *
 * One of three terminal states:
 *
 * - `selected` with `reason: 'recommended'` — the first available
 *   recommended match. Carries the matched `model` (the full `Model`
 *   object when called with the probe's `Model[]`); the wizard formats
 *   it as `provider/model` for the agent-model value (formatting is the
 *   wizard's concern, NOT the engine's).
 * - `selected` with `reason: 'fallback'` — the tier-derived fallback: the
 *   user's configured `small_model` (cheap tier, preferred) or `model`.
 *   Carries the raw config `value` to write VERBATIM (already in the
 *   config's native format, so formatting does NOT arise on this path).
 * - `unset` — no recommended match AND no applicable tier default. Under
 *   `--yes` the wizard never guesses a model: `autoSelect` returns
 *   `unset` and the wizard emits a warning and skips model assignment
 *   for this agent.
 *
 * The engine itself never logs a warning — it returns `unset` as a
 * structured result and the wizard reacts (the engine is a pure function
 * with no failure modes).
 */
export type AgentSelection<M extends RecommendableModel = RecommendableModel> =
  | {
      readonly agent: string;
      readonly status: 'selected';
      /**
       * The matched model object (carries the full `Model` shape when
       * called with the probe's `Model[]`). The wizard formats it
       * (`provider/model`) for the agent-model value.
       */
      readonly model: M;
      readonly reason: 'recommended';
    }
  | {
      readonly agent: string;
      readonly status: 'selected';
      /**
       * The configured default string to write verbatim (already in the
       * config's native `provider/model` format — the engine does not
       * format it; formatting is moot on the fallback path).
       */
      readonly value: string;
      readonly reason: 'fallback';
    }
  | { readonly agent: string; readonly status: 'unset' };

/**
 * Test whether a keyword matches a model, case-insensitively as a
 * substring of the model's `id` (primary signal) or `name` (secondary
 * signal).
 *
 * The keyword is lowercased once; both fields are lowercased for the
 * substring check. Returns `true` if EITHER field contains the keyword.
 */
function matchesKeyword(model: RecommendableModel, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle);
}

/**
 * The first keyword (in declaration order) that matches the model, with its
 * declaration-order index, or `null` when no keyword matches. Used both to
 * set `recommended`/the `matchedKeyword` badge and to sort recommended
 * models by keyword priority (earlier keyword = higher rank).
 *
 * Iterates via `Array.prototype.entries()` (no indexed access, so no
 * `noUncheckedIndexedAccess` / non-null-assertion concerns) and returns the
 * matched keyword alongside its index so callers never re-index into the
 * list.
 */
function findMatchedKeyword(
  recommendation: AgentRecommendation,
  model: RecommendableModel,
): { readonly idx: number; readonly keyword: string } | null {
  for (const [i, keyword] of recommendation.keywords.entries()) {
    if (matchesKeyword(model, keyword)) {
      return { idx: i, keyword };
    }
  }
  return null;
}

/**
 * Rank the candidate models for one SDD subagent.
 *
 * Recommended models (those matching at least one of the agent's keywords)
 * appear FIRST, ordered by the declaration-order index of their
 * `matchedKeyword` (earlier keyword = higher rank). Non-recommended models
 * follow in their original input order. The sort is stable across models
 * sharing the same keyword index (input order preserved within a tier —
 * `Array.prototype.sort` is stable in Node 24 / V8).
 *
 * The function is data-driven + generic: it reads `tier`/`keywords` from
 * the passed `recommendation` (NOT from a hardcoded table), so it is fully
 * unit-testable with arbitrary fixture tables. The caller passes entries
 * from the shipped {@link SUBAGENT_RECOMMENDATIONS} constant in production.
 *
 * @param recommendation The per-agent recommendation (agent name, ordered
 *   keyword list, tier).
 * @param models The candidate models (the probe's `Model[]` in production;
 *   light `{ id, name }` objects in tests).
 * @returns `RankedModel[]` — recommended first (by keyword priority), then
 *   non-recommended (input order). Empty when `models` is empty.
 *
 * @internal Exported for tests only (used by `recommend.test.ts` to
 * exercise ranking in isolation). Not re-exported from the module barrel
 * — consumed directly by co-located test files.
 */
export function rankFor<M extends RecommendableModel>(
  recommendation: AgentRecommendation,
  models: readonly M[],
): RankedModel<M>[] {
  const indexed = models.map((model) => {
    const match = findMatchedKeyword(recommendation, model);
    return {
      model,
      recommended: match !== null,
      matchedKeyword: match?.keyword,
      idx: match?.idx ?? -1,
    };
  });
  indexed.sort((a, b) => {
    // Recommended models first.
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    // Within recommended, ascending keyword index (earlier keyword = higher).
    if (a.recommended) return a.idx - b.idx;
    // Within non-recommended, input order is preserved (stable sort).
    return 0;
  });
  return indexed.map(({ model, recommended, matchedKeyword }) =>
    matchedKeyword === undefined ? { model, recommended } : { model, recommended, matchedKeyword },
  );
}

/**
 * Auto-select a model for each SDD subagent with the tier-derived fallback.
 *
 * For each recommendation (in input order):
 *   1. If a recommended match is available (the first `rankFor` result with
 *      `recommended: true`), select that model (`reason: 'recommended'`).
 *   2. Else apply the tier-derived fallback (carrying the raw config
 *      `value` to write verbatim — it is already in the config's native
 *      format):
 *        - `cheap`  -> `defaults.small_model` (if set), else
 *                      `defaults.model` (if set).
 *        - `strong` -> `defaults.model` (if set).
 *   3. Else `unset` (no recommended match AND no applicable tier default).
 *
 * `unset` is the "wizard never guesses a model" outcome. Under `--yes`,
 * `autoSelect` returns `unset` for such agents and the wizard emits a
 * warning + skips the model assignment; under the interactive flow the
 * same `unset` signal drives the same leave-it-alone behaviour.
 *
 * The engine itself never logs — it returns `unset` as a structured result
 * and the wizard reacts (the engine is a pure function with no failure
 * modes).
 *
 * @param recommendations The per-agent recommendation table (the shipped
 *   `SUBAGENT_RECOMMENDATIONS` in production; fixture tables in tests).
 * @param models The candidate models (the probe's `Model[]` in production).
 * @param defaults The effective default `model`/`small_model` from config.
 * @returns `AgentSelection[]` — one entry per recommendation, in input
 *   order.
 */
export function autoSelect<M extends RecommendableModel>(
  recommendations: readonly AgentRecommendation[],
  models: readonly M[],
  defaults: RecommendDefaults,
): AgentSelection<M>[] {
  return recommendations.map((recommendation) => {
    const ranked = rankFor(recommendation, models);
    const firstRecommended = ranked.find((r) => r.recommended);
    if (firstRecommended !== undefined) {
      return {
        agent: recommendation.agent,
        status: 'selected' as const,
        model: firstRecommended.model,
        reason: 'recommended' as const,
      };
    }
    const fallbackValue =
      recommendation.tier === 'cheap' ? (defaults.small_model ?? defaults.model) : defaults.model;
    if (fallbackValue !== undefined) {
      return {
        agent: recommendation.agent,
        status: 'selected' as const,
        value: fallbackValue,
        reason: 'fallback' as const,
      };
    }
    return {
      agent: recommendation.agent,
      status: 'unset' as const,
    };
  });
}
