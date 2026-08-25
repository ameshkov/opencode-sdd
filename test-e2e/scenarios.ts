/**
 * Scripted scenarios for the mock LLM, expressed as ordered {@link Turn}s.
 *
 * Each turn is consumed by one `/v1/chat/completions` request, so a scenario
 * is a faithful script of the agent loop: a tool-call turn triggers the `write`
 * tool, opencode feeds the tool result back, and the next turn runs.
 */
import type { Turn } from './mock-server.js';

/**
 * Scenario: write a single file, then reply "Done".
 *
 * @param filePath - Absolute path the model should write to.
 * @param content - Exact file content the model should write.
 * @returns A two-turn scenario: `[write(filePath, content), text("Done")]`.
 */
export function writeFileScenario(filePath: string, content: string): Turn[] {
  return [
    {
      type: 'tool-call',
      toolCalls: [{ name: 'write', arguments: { filePath, content } }],
    },
    { type: 'text', text: 'Done' },
  ];
}

/**
 * Scenario: write several files in sequence, then reply "Done".
 *
 * One tool-call turn per file — each is a separate round-trip through the
 * agent loop — followed by a final text turn that terminates the run.
 *
 * @param files - Files to write, in order.
 * @returns One tool-call turn per file plus a terminating text turn.
 */
export function writeFilesScenario(files: Array<{ filePath: string; content: string }>): Turn[] {
  const turns: Turn[] = files.map((file) => ({
    type: 'tool-call',
    toolCalls: [{ name: 'write', arguments: { filePath: file.filePath, content: file.content } }],
  }));
  turns.push({ type: 'text', text: 'Done' });
  return turns;
}

/**
 * Scenario: the session's agent calls `sdd-command` with `commandName`
 * directly, then replies `done`.
 *
 * The agent is chosen via the prompt's `agent` field
 * (`sdd-planner`/`sdd-validator` for the worker success path, `sdd-build` for
 * the deny path), so the call and its result stay in the session the test
 * inspects.
 *
 * @param commandName - The `command` argument the agent passes to
 *   `sdd-command` (allowlisted for the success path, not allowlisted for the
 *   error path).
 * @returns Two turns: the sdd-command call, then the done text.
 */
export function sddCommandScenario(commandName: string): Turn[] {
  return [
    {
      type: 'tool-call',
      toolCalls: [{ name: 'sdd-command', arguments: { command: commandName } }],
    },
    { type: 'text', text: 'done' },
  ];
}

/**
 * The four optimistic-path stages, in dispatch order. Each stage dispatches
 * one worker which loads its `prd-*` command via `sdd-command`.
 */
const FULL_AUTO_STAGES: Array<{ agent: string; command: string }> = [
  { agent: 'sdd-planner', command: 'prd-issue-to-plan' },
  { agent: 'sdd-reviewer', command: 'prd-review-plan' },
  { agent: 'sdd-coder', command: 'prd-implement-issue' },
  { agent: 'sdd-validator', command: 'prd-validate-issue' },
];

/**
 * Scenario: the orchestrator dispatches all four stage workers for one
 * issue, in order, each loading its `prd-*` command via `sdd-command`, then
 * ends.
 *
 * Turn order is global FIFO across the primary and sub-agent loops (the
 * mock queue is shared), so the scenario interleaves primary dispatch
 * turns and worker turns exactly as opencode will call the model: primary
 * dispatch → worker `sdd-command` → worker "done" → next primary dispatch
 * → … → primary "done".
 *
 * @returns 13 turns: 4 dispatch/sdd-command/done triples plus a final
 *   primary "done".
 */
export function autoImplementHappyPathScenario(): Turn[] {
  const turns: Turn[] = [];
  for (const stage of FULL_AUTO_STAGES) {
    turns.push({
      type: 'tool-call',
      toolCalls: [
        {
          name: 'task',
          arguments: {
            subagent_type: stage.agent,
            description: `run ${stage.command}`,
            prompt: `load ${stage.command} via sdd-command and follow it`,
          },
        },
      ],
    });
    turns.push({
      type: 'tool-call',
      toolCalls: [{ name: 'sdd-command', arguments: { command: stage.command } }],
    });
    turns.push({ type: 'text', text: 'done' });
  }
  turns.push({ type: 'text', text: 'done' });
  return turns;
}

/**
 * Scenario: the orchestrator hits a prerequisite hard-stop and emits the
 * error text without dispatching anything.
 *
 * @param errorText - The hard-stop error the model emits.
 * @returns A single text turn.
 */
export function autoImplementHardStopScenario(errorText: string): Turn[] {
  return [{ type: 'text', text: errorText }];
}

/**
 * Scenario: the orchestrator is mediating a HITL issue whose planner reported
 * an unresolved before-planning decision, calls the `question` tool to present
 * it, then ends its turn (pausing for user input). The `question` tool blocks
 * until the test auto-answers it via the `/question/{id}/reply` API.
 *
 * @returns Two turns: a `question` tool-call presenting the HITL decision,
 *   then a text turn ending the orchestrator's run.
 */
export function autoImplementHitlPauseScenario(): Turn[] {
  return [
    {
      type: 'tool-call',
      toolCalls: [
        {
          name: 'question',
          arguments: {
            questions: [
              {
                question:
                  'Issue 1-HITL has an unresolved before-planning decision. How should we proceed?',
                header: 'HITL: 1-HITL',
                options: [
                  { label: 'Approach A', description: 'First implementation approach' },
                  { label: 'Approach B', description: 'Second implementation approach' },
                ],
              },
            ],
          },
        },
      ],
    },
    { type: 'text', text: 'Pausing for your input on issue 1-HITL.' },
  ];
}

/**
 * The three turns that make up one stage dispatch on the orchestrator's
 * primary loop: the primary dispatches the worker (task), the worker loads
 * its command (sdd-command), then the worker ends. Mirrors the per-stage
 * turn block inlined by {@link autoImplementHappyPathScenario}, factored out so
 * the review-loop builders can compose it.
 *
 * @param agent - The worker `subagent_type` (e.g. `sdd-planner`).
 * @param command - The `command` argument the worker passes to sdd-command.
 * @param prompt - The dispatch `prompt` the primary sends to the worker.
 * @returns Three turns: task dispatch, sdd-command call, worker "done".
 */
export function stageDispatchTriple(agent: string, command: string, prompt: string): Turn[] {
  return [
    {
      type: 'tool-call',
      toolCalls: [
        {
          name: 'task',
          arguments: { subagent_type: agent, description: `run ${command}`, prompt },
        },
      ],
    },
    {
      type: 'tool-call',
      toolCalls: [{ name: 'sdd-command', arguments: { command } }],
    },
    { type: 'text', text: 'done' },
  ];
}

/**
 * The two turns that make up one stage dispatch when the worker does NOT
 * load a command via `sdd-command` (it follows the dispatch prompt
 * directly): the primary dispatches the worker (task), then the worker
 * ends. Used by the cross-cutting coder fix dispatches, where the coder
 * makes a minimal targeted fix directly from the orchestrator's prompt
 * rather than loading `prd-implement-issue`.
 *
 * @param agent - The worker `subagent_type` (e.g. `sdd-coder`).
 * @param description - A short label for the dispatch.
 * @param prompt - The dispatch `prompt` the primary sends to the worker.
 * @returns Two turns: task dispatch, worker "done".
 */
export function stageDispatchPair(agent: string, description: string, prompt: string): Turn[] {
  return [
    {
      type: 'tool-call',
      toolCalls: [
        {
          name: 'task',
          arguments: { subagent_type: agent, description, prompt },
        },
      ],
    },
    { type: 'text', text: 'done' },
  ];
}

/** Dispatch prompts reused across the loop scenario builders. */
export const PLAN_PROMPT = 'load prd-issue-to-plan via sdd-command and follow it';
const REVISE_PROMPT =
  'load prd-issue-to-plan via sdd-command and follow it. Address the prior review findings.';
export const REVIEW_PROMPT = 'load prd-review-plan via sdd-command and follow it';
export const CODER_PROMPT = 'load prd-implement-issue via sdd-command and follow it';
export const VALIDATOR_PROMPT = 'load prd-validate-issue via sdd-command and follow it';
export const FIX_PROMPT =
  'load prd-implement-issue via sdd-command and follow it. Address the prior validation findings.';

/**
 * Scenario: the plan fails review `rejections` times, then the next review
 * approves and the orchestrator proceeds through coder and validator.
 *
 * Produces `(rejections + 1)` planner↔reviewer cycles (the initial plan +
 * `rejections` revision cycles), then the coder and validator dispatches,
 * then a terminating primary "done". For `rejections = 2` this is the
 * issue's "fails twice then passes" case: three reviews, no escalation.
 *
 * @param rejections - Number of failing reviews before the approving one.
 * @returns The scripted turn sequence.
 */
export function autoImplementReviewLoopScenario(rejections: number): Turn[] {
  const turns: Turn[] = [];
  turns.push(...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT));
  turns.push(...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT));
  for (let i = 0; i < rejections; i++) {
    turns.push(...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', REVISE_PROMPT));
    turns.push(...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT));
  }
  turns.push(...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT));
  turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT));
  turns.push({ type: 'text', text: 'done' });
  return turns;
}

/**
 * Scenario: the plan fails review through the cap (three failing reviews),
 * then the orchestrator escalates via the `question` tool and ends its turn.
 *
 * Three planner↔reviewer cycles, then a `question` tool-call presenting the
 * escalation, then a text turn that ends the orchestrator's run. No coder is
 * dispatched. The question blocks until the test answers it via
 * {@link replyToPendingQuestion}.
 *
 * @returns The scripted turn sequence.
 */
export function autoImplementReviewEscalationScenario(): Turn[] {
  const turns: Turn[] = [];
  turns.push(...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT));
  turns.push(...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT));
  for (let i = 0; i < 2; i++) {
    turns.push(...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', REVISE_PROMPT));
    turns.push(...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT));
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
                'Plan review for this issue hit the attempt cap (3). Consolidated findings are in review.md. How should we proceed?',
              header: 'Review cap reached',
              options: [
                {
                  label: 'Revise with guidance',
                  description: 'I will provide revision guidance',
                },
              ],
            },
          ],
        },
      },
    ],
  });
  turns.push({ type: 'text', text: 'Escalating: plan review cap reached.' });
  return turns;
}

/**
 * Scenario: the orchestrator escalates at the review cap (see
 * {@link autoImplementReviewEscalationScenario}), the user resumes with
 * `guidance`, and the orchestrator dispatches the planner carrying that
 * guidance, then a fresh reviewer, coder, and validator.
 *
 * The mock queue persists across the command (pause) and the resume prompt
 * within the same session, so the resume turns are consumed by the
 * `session.prompt` call that follows the escalation pause — mirroring the
 * HITL pause/resume pattern.
 *
 * @param guidance - The user's revision guidance, embedded in the resume
 *   planner dispatch prompt.
 * @returns The scripted turn sequence (escalation turns + resume turns).
 */
export function autoImplementReviewResumeScenario(guidance: string): Turn[] {
  const turns: Turn[] = autoImplementReviewEscalationScenario();
  turns.push(
    ...stageDispatchTriple(
      'sdd-planner',
      'prd-issue-to-plan',
      `load prd-issue-to-plan via sdd-command and follow it. User guidance: ${guidance}`,
    ),
  );
  turns.push(...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT));
  turns.push(...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT));
  turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT));
  turns.push({ type: 'text', text: 'done' });
  return turns;
}

/**
 * Scenario: validation fails `failures` times after the initial
 * implementation, then the next validation passes and the orchestrator
 * completes the issue.
 *
 * Produces a planner + reviewer pass (the plan is assumed to pass review),
 * then `(failures + 1)` coder↔validator cycles (the initial implementation
 * + `failures` fix cycles), then a terminating primary "done". For
 * `failures = 2` this is the issue's "fails twice then passes" case: three
 * coder→validator dispatches, no escalation.
 *
 * @param failures - Number of failing validations after the initial one
 *   before the passing one.
 * @returns The scripted turn sequence.
 */
export function autoImplementValidationLoopScenario(failures: number): Turn[] {
  const turns: Turn[] = [];
  turns.push(...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT));
  turns.push(...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT));
  turns.push(...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT));
  turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT));
  for (let i = 0; i < failures; i++) {
    turns.push(...stageDispatchTriple('sdd-coder', 'prd-implement-issue', FIX_PROMPT));
    turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT));
  }
  turns.push({ type: 'text', text: 'done' });
  return turns;
}

/**
 * Scenario: validation fails through the cap (the initial validation plus
 * two fix cycles — three failing validations), then the orchestrator
 * escalates via the `question` tool and ends its turn.
 *
 * A planner + reviewer pass, three coder↔validator cycles, then a
 * `question` tool-call presenting the escalation, then a text turn that
 * ends the orchestrator's run. No fourth validation cycle is dispatched.
 * The question blocks until the test answers it via
 * {@link replyToPendingQuestion}.
 *
 * @returns The scripted turn sequence.
 */
export function autoImplementValidationEscalationScenario(): Turn[] {
  const turns: Turn[] = [];
  turns.push(...stageDispatchTriple('sdd-planner', 'prd-issue-to-plan', PLAN_PROMPT));
  turns.push(...stageDispatchTriple('sdd-reviewer', 'prd-review-plan', REVIEW_PROMPT));
  turns.push(...stageDispatchTriple('sdd-coder', 'prd-implement-issue', CODER_PROMPT));
  turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT));
  for (let i = 0; i < 2; i++) {
    turns.push(...stageDispatchTriple('sdd-coder', 'prd-implement-issue', FIX_PROMPT));
    turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT));
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
                'Per-issue validation for this issue hit the attempt cap (3). Findings are in validation.md. How should we proceed?',
              header: 'Validation cap reached',
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
  turns.push({ type: 'text', text: 'Escalating: per-issue validation cap reached.' });
  return turns;
}

/**
 * Scenario: the orchestrator escalates at the validation cap (see
 * {@link autoImplementValidationEscalationScenario}), the user resumes with
 * `guidance`, and the orchestrator dispatches the coder carrying that
 * guidance, then a fresh validator.
 *
 * The mock queue persists across the command (pause) and the resume prompt
 * within the same session, so the resume turns are consumed by the
 * `session.prompt` call that follows the escalation pause — mirroring the
 * HITL and review-resume patterns.
 *
 * @param guidance - The user's fix guidance, embedded in the resume coder
 *   dispatch prompt.
 * @returns The scripted turn sequence (escalation turns + resume turns).
 */
export function autoImplementValidationResumeScenario(guidance: string): Turn[] {
  const turns: Turn[] = autoImplementValidationEscalationScenario();
  turns.push(
    ...stageDispatchTriple(
      'sdd-coder',
      'prd-implement-issue',
      `load prd-implement-issue via sdd-command and follow it. User guidance: ${guidance}`,
    ),
  );
  turns.push(...stageDispatchTriple('sdd-validator', 'prd-validate-issue', VALIDATOR_PROMPT));
  turns.push({ type: 'text', text: 'done' });
  return turns;
}

export * from './cross-cutting-scenarios.js';
export * from './resume-scenarios.js';
