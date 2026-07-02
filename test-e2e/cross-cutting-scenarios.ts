/**
 * Cross-cutting validation scenarios for the `prd-auto-implement` orchestrator's
 * Phase 3 loop. Extracted from {@link './scenarios.js'} to keep that file
 * within the ESLint `max-lines` gate; re-exported from there via `export *`.
 */
import type { Turn } from './mock-server.js';
import {
  CODER_PROMPT,
  PLAN_PROMPT,
  REVIEW_PROMPT,
  stageDispatchPair,
  stageDispatchTriple,
  VALIDATOR_PROMPT,
} from './scenarios.js';

/** Cross-cutting validator dispatch prompt (validator still loads `prd-validate`). */
const CROSS_CUT_PROMPT = 'load prd-validate via sdd-command and follow it';
/**
 * Cross-cutting coder fix dispatch prompt. The coder makes a minimal
 * targeted fix directly from this prompt (it does NOT load
 * `prd-implement-issue`), reading the finding details from
 * `{SPECS_DIR}/validation.md` and marking the fixed finding `Fixed`.
 */
const CROSS_CUT_FIX_PROMPT =
  'Fix this cross-cutting finding. Read {SPECS_DIR}/validation.md for the full finding details, then mark that finding Fixed (by adding a `- **Status**: Fixed` line to the finding entry) after fixing it.';

/**
 * Scenario: after the four per-issue stages complete, the orchestrator
 * dispatches the cross-cutting `sdd-validator` (loading `prd-validate`),
 * the report is Complete, and the orchestrator finalizes and stops.
 *
 * @returns 16 turns: 12 per-issue stage turns + 3 cross-cutting
 *   validation turns + a terminating primary "done".
 */
export function autoImplementCrossCuttingCompleteScenario(): Turn[] {
  return [
    ...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT),
    ...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT),
    ...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate', CROSS_CUT_PROMPT),
    { type: 'text', text: 'done' },
  ];
}

/**
 * Scenario: the first cross-cutting report is Incomplete with
 * `openFindings` open Critical/High findings. The orchestrator dispatches
 * one `sdd-coder` per finding, then re-runs cross-cutting validation which
 * reports Complete.
 *
 * @param openFindings - Number of open Critical/High findings to fix.
 * @returns The scripted turn sequence.
 */
export function autoImplementCrossCuttingFixScenario(openFindings: number): Turn[] {
  const turns: Turn[] = [
    ...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT),
    ...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT),
    ...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate', CROSS_CUT_PROMPT),
  ];
  for (let i = 0; i < openFindings; i++) {
    turns.push(...stageDispatchPair('sdd-coder', 'run coder-fix', CROSS_CUT_FIX_PROMPT));
  }
  turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate', CROSS_CUT_PROMPT));
  turns.push({ type: 'text', text: 'done' });
  return turns;
}

/**
 * Scenario: the cross-cutting report stays Incomplete through the cap
 * (three failing cross-cutting validations, each followed by a coder fix),
 * then the orchestrator escalates via the `question` tool and ends its
 * turn.
 *
 * @returns The scripted turn sequence.
 */
export function autoImplementCrossCuttingEscalationScenario(): Turn[] {
  const turns: Turn[] = [
    ...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT),
    ...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT),
    ...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT),
    ...stageDispatchTriple('sdd-validator', 'prd-validate', CROSS_CUT_PROMPT),
  ];
  for (let i = 0; i < 2; i++) {
    turns.push(...stageDispatchPair('sdd-coder', 'run coder-fix', CROSS_CUT_FIX_PROMPT));
    turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate', CROSS_CUT_PROMPT));
  }
  turns.push({
    type: 'tool-call',
    toolCalls: [
      {
        name: 'question',
        arguments: {
          questions: [
            {
              question:
                'Cross-cutting validation hit the attempt cap (3). Findings are in validation.md. How should we proceed?',
              header: 'Cross-cutting cap reached',
              options: [
                {
                  label: 'Fix with guidance',
                  description: 'I will provide fix guidance',
                },
              ],
            },
          ],
        },
      },
    ],
  });
  turns.push({ type: 'text', text: 'Escalating: cross-cutting validation cap reached.' });
  return turns;
}

/**
 * Scenario: the orchestrator escalates at the cross-cutting cap (see
 * {@link autoImplementCrossCuttingEscalationScenario}), the user resumes with
 * `guidance`, and the orchestrator dispatches the coder carrying that
 * guidance, then a fresh cross-cutting validator.
 *
 * @param guidance - The user's fix guidance, embedded in the resume coder
 *   dispatch prompt.
 * @returns The scripted turn sequence (escalation turns + resume turns).
 */
export function autoImplementCrossCuttingResumeScenario(guidance: string): Turn[] {
  const turns = autoImplementCrossCuttingEscalationScenario();
  turns.push(
    ...stageDispatchPair(
      'sdd-coder',
      'run coder-fix',
      `Fix this cross-cutting finding. Read {SPECS_DIR}/validation.md for the full finding details, then mark that finding Fixed (by adding a \`- **Status**: Fixed\` line to the finding entry) after fixing it. User guidance: ${guidance}`,
    ),
  );
  turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate', CROSS_CUT_PROMPT));
  turns.push({ type: 'text', text: 'done' });
  return turns;
}
