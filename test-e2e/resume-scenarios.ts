/**
 * Resume scenarios for the `prd-auto-implement` orchestrator's interruption
 * recovery behaviour (User Story 10). Each builder scripts the dispatch
 * turns a resuming orchestrator emits, mirroring how the mock-LLM e2e
 * suite expresses the other loops. Re-exported from
 * {@link './scenarios.js'} via `export *`.
 */
import type { Turn } from './mock-server.js';
import {
  CODER_PROMPT,
  FIX_PROMPT,
  PLAN_PROMPT,
  REVIEW_PROMPT,
  stageDispatchTriple,
  VALIDATOR_PROMPT,
} from './scenarios.js';

/**
 * Scenario: a prior run validated issues `1-*` and `2-*` but was
 * interrupted before issue `3-AFK` was planned. On resume the
 * orchestrator skips the validated issues (no dispatches for them) and
 * runs the full four-stage dispatch for the first incomplete issue
 * only.
 *
 * @returns 13 turns: the four-stage dispatch for the resumed issue,
 *   plus a terminating primary "done".
 */
export function autoImplementResumeSkipValidatedScenario(): Turn[] {
  return [
    ...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT),
    ...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT),
    ...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT),
    { type: 'text', text: 'done' },
  ];
}

/**
 * Scenario: a prior run was interrupted mid-implementation (the issue's
 * `**Status**` is `In Progress`). On resume the orchestrator skips
 * planning and review and dispatches only the coder (which resumes from
 * the plan's `[x]` markers), followed by the validator.
 *
 * @returns 7 turns: coder + validator dispatch triples, plus a
 *   terminating primary "done".
 */
export function autoImplementResumeInProgressScenario(): Turn[] {
  return [
    ...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT),
    { type: 'text', text: 'done' },
  ];
}

/**
 * Scenario: a prior run was interrupted mid-validation loop (the issue's
 * `**Status**` is `Implemented`; the first validation failed). On resume
 * the orchestrator continues the loop — dispatching the coder to fix the
 * findings then the validator to re-validate — without resetting the
 * persisted `**Validation attempt**` counter.
 *
 * @returns 7 turns: coder-fix + validator dispatch triples, plus a
 *   terminating primary "done".
 */
export function autoImplementResumeMidValidationScenario(): Turn[] {
  return [
    ...stageDispatchTriple('sdd-coder', 'prd-implement-issue', FIX_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT),
    { type: 'text', text: 'done' },
  ];
}
