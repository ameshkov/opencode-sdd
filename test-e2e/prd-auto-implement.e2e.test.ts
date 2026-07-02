/**
 * E2E: `prd-auto-implement` command plumbing. Drives the command through a real
 * opencode server against a local mock LLM. The mock ignores the prompt, so
 * these tests verify plumbing — the dispatch sequence on the optimistic
 * path, no dispatch on a scripted hard-stop, and that the command template
 * reaches the model as the prompt. The prompt's actual decision logic
 * (hard-stop, re-read timing) is HITL-verified.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSession, replyToPendingQuestion } from './harness.js';
import type { MockLlmState } from './mock-server.js';
import {
  type CleanupFn,
  capturedPromptText,
  completedTools,
  inputField,
  runAutoImplement,
  sessionParts,
  setupAutoImplementServer,
  tempProjectDir,
} from './prd-auto-implement-helpers.js';
import type { OpencodeServerHandle } from './harness.js';
import {
  autoImplementCrossCuttingCompleteScenario,
  autoImplementCrossCuttingEscalationScenario,
  autoImplementCrossCuttingFixScenario,
  autoImplementCrossCuttingResumeScenario,
  autoImplementHardStopScenario,
  autoImplementHappyPathScenario,
  autoImplementHitlPauseScenario,
  autoImplementReviewEscalationScenario,
  autoImplementReviewLoopScenario,
  autoImplementReviewResumeScenario,
  autoImplementValidationEscalationScenario,
  autoImplementValidationLoopScenario,
  autoImplementValidationResumeScenario,
} from './scenarios.js';

const cleanup: CleanupFn[] = [];
afterEach(() => {
  while (cleanup.length > 0) {
    const fn = cleanup.pop();
    if (fn) {
      try {
        fn();
      } catch {
        /* best-effort cleanup */
      }
    }
  }
});

describe('prd-auto-implement e2e', () => {
  let server: OpencodeServerHandle;
  let mock: MockLlmState;
  let questionAvailable = false;

  beforeAll(async () => {
    const setup = await setupAutoImplementServer(cleanup);
    server = setup.server;
    mock = setup.mock;
    questionAvailable = setup.questionAvailable;
  });

  afterAll(() => {
    server?.close();
    mock?.close();
  });

  it('dispatches planner, reviewer, coder, validator in order on the optimistic path', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementHappyPathScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);

    const taskDispatches = completedTools(parts, 'task');
    const agents = taskDispatches.map((part) => String(inputField(part, 'subagent_type')));
    expect(agents).toEqual(['sdd-planner', 'sdd-reviewer', 'sdd-coder', 'sdd-validator']);

    // AFK issues never trigger the question tool.
    expect(completedTools(parts, 'question')).toEqual([]);

    // The sdd-command calls execute inside the spawned sub-agent sessions,
    // so they are not visible in this primary session's parts. Instead,
    // verify each task dispatch instructed the worker to load the right
    // `prd-*` command via sdd-command — the dispatch prompt carries the
    // command name.
    const dispatchPrompts = taskDispatches.map((part) => String(inputField(part, 'prompt')));
    expect(dispatchPrompts).toEqual([
      'load prd-issue-to-plan via sdd-command and follow it',
      'load prd-review-plan via sdd-command and follow it',
      'load prd-implement-issue via sdd-command and follow it',
      'load prd-validate-issue via sdd-command and follow it',
    ]);

    // The command template reaches the model as the prompt — proving the
    // prd-auto-implement command (not a stub) drove the run.
    const promptText = capturedPromptText(mock);
    expect(promptText).toContain('Orchestrate full PRD implementation');
    expect(promptText).toContain('re-read');
  });

  it('hard-stops with the missing-PRD error and dispatches nothing', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(
      autoImplementHardStopScenario(
        'ERROR: PRD not found at `.sdd/.current/prd.md`. Run `/prd-write` first.',
      ),
    );

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    expect(completedTools(parts, 'task')).toEqual([]);

    // The orchestrator prompt (with its hard-stop instruction) reached the
    // model, proving the command loaded rather than the run being a no-op.
    const promptText = capturedPromptText(mock);
    expect(promptText).toContain('prd-write');
  });

  it('hard-stops with the missing-issues error and dispatches nothing', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(
      autoImplementHardStopScenario(
        'ERROR: No issues found in `.sdd/.current/issues/`. Run `/prd-to-issues` first.',
      ),
    );

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    expect(completedTools(parts, 'task')).toEqual([]);

    const promptText = capturedPromptText(mock);
    expect(promptText).toContain('prd-to-issues');
  });

  it('calls the question tool for a HITL issue and does not dispatch the coder', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementHitlPauseScenario());

    const client = server.client;
    const session = await createSession(client, directory);

    // The question tool blocks the agent loop until answered. Run the
    // command concurrently with an auto-answerer that replies via the
    // /question/{id}/reply API.
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [['Approach A']]);
    await commandPromise;

    const parts = await sessionParts(client, session.id, directory);

    // The question tool was called.
    expect(completedTools(parts, 'question').length).toBeGreaterThanOrEqual(1);

    // No coder dispatch happened — the orchestrator paused while mediating a
    // before-planning HITL decision (the planner owns HITL; implementation
    // has not started).
    const coderTasks = completedTools(parts, 'task').filter(
      (part) => String(inputField(part, 'subagent_type')) === 'sdd-coder',
    );
    expect(coderTasks).toEqual([]);
  }, 15_000);

  it('re-dispatches the planner on resume after a HITL pause and does not dispatch the coder', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    const reply = 'Approach A';

    // Full pause-resume scenario. The mock queue persists across the
    // command (pause) and prompt (resume) invocations within the same
    // session, so turns 3-6 are consumed during the resume prompt.
    mock.reset([
      // Turn 1: question tool-call (HITL pause) — planner reported an
      // unresolved before-planning decision, orchestrator surfaces it.
      {
        type: 'tool-call',
        toolCalls: [
          {
            name: 'question',
            arguments: {
              questions: [
                {
                  question: 'Issue 1-HITL has an unresolved before-planning decision.',
                  header: 'HITL: 1-HITL',
                  options: [
                    { label: 'Approach A', description: 'First approach' },
                    { label: 'Approach B', description: 'Second approach' },
                  ],
                },
              ],
            },
          },
        ],
      },
      // Turn 2: orchestrator ends its turn (pausing).
      { type: 'text', text: 'Pausing for your input on issue 1-HITL.' },
      // Turn 3: after the user resumes, the orchestrator records the answer
      // in issue.md and re-dispatches the planner (not the coder).
      {
        type: 'tool-call',
        toolCalls: [
          {
            name: 'task',
            arguments: {
              subagent_type: 'sdd-planner',
              description: 'run prd-issue-to-plan',
              prompt: 'load prd-issue-to-plan via sdd-command and follow it',
            },
          },
        ],
      },
      // Turn 4: planner calls sdd-command.
      {
        type: 'tool-call',
        toolCalls: [{ name: 'sdd-command', arguments: { command: 'prd-issue-to-plan' } }],
      },
      // Turn 5: planner done.
      { type: 'text', text: 'done' },
      // Turn 6: orchestrator done.
      { type: 'text', text: 'done' },
    ]);

    const client = server.client;
    const session = await createSession(client, directory);

    // Phase 1: pause — command blocks on the question tool.
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [[reply]]);
    await commandPromise;

    // Phase 2: resume — user answers, orchestrator records it and
    // re-dispatches the planner.
    await client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: 'text', text: reply }] },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    // The question tool was called during the pause.
    expect(completedTools(parts, 'question').length).toBeGreaterThanOrEqual(1);

    // On resume the orchestrator re-dispatched the planner, not the coder.
    const plannerTasks = completedTools(parts, 'task').filter(
      (part) => String(inputField(part, 'subagent_type')) === 'sdd-planner',
    );
    expect(plannerTasks.length).toBeGreaterThanOrEqual(1);
    const coderTasks = completedTools(parts, 'task').filter(
      (part) => String(inputField(part, 'subagent_type')) === 'sdd-coder',
    );
    expect(coderTasks).toEqual([]);
  }, 15_000);

  it('loops planner and reviewer through three reviews when the plan fails twice then passes', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementReviewLoopScenario(2));

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );
    // Three review cycles (planner + reviewer each), then coder + validator.
    expect(agents).toEqual([
      'sdd-planner',
      'sdd-reviewer',
      'sdd-planner',
      'sdd-reviewer',
      'sdd-planner',
      'sdd-reviewer',
      'sdd-coder',
      'sdd-validator',
    ]);
    // No escalation on a recoverable loop.
    expect(completedTools(parts, 'question')).toEqual([]);
  });

  it('escalates via the question tool at the review cap and dispatches no coder', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementReviewEscalationScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [['Revise with guidance']]);
    await commandPromise;

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );
    // Three review cycles, then escalation — no further dispatch.
    expect(agents).toEqual([
      'sdd-planner',
      'sdd-reviewer',
      'sdd-planner',
      'sdd-reviewer',
      'sdd-planner',
      'sdd-reviewer',
    ]);
    expect(completedTools(parts, 'question').length).toBeGreaterThanOrEqual(1);
    expect(agents).not.toContain('sdd-coder');
  }, 15_000);

  it('resumes after escalation by dispatching the planner with user guidance and a fresh review', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    const guidance = 'Split Task 1 into two smaller tasks';
    mock.reset(autoImplementReviewResumeScenario(guidance));

    const client = server.client;
    const session = await createSession(client, directory);

    // Phase 1: the orchestrator escalates and pauses on the question.
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [['Revise with guidance']]);
    await commandPromise;

    // Phase 2: the user resumes with revision guidance.
    await client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: 'text', text: guidance }] },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    const plannerTasks = completedTools(parts, 'task').filter(
      (part) => String(inputField(part, 'subagent_type')) === 'sdd-planner',
    );
    // The post-resume planner dispatch is the last planner dispatch and
    // carries the user's guidance.
    const resumeDispatch = plannerTasks[plannerTasks.length - 1]!;
    expect(String(inputField(resumeDispatch, 'prompt'))).toContain(guidance);
  }, 15_000);

  it('loops coder and validator through three validations when validation fails twice then passes', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementValidationLoopScenario(2));

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );
    // Plan passes review (planner + reviewer), then three coder↔validator
    // cycles: initial implementation + two fix cycles.
    expect(agents).toEqual([
      'sdd-planner',
      'sdd-reviewer',
      'sdd-coder',
      'sdd-validator',
      'sdd-coder',
      'sdd-validator',
      'sdd-coder',
      'sdd-validator',
    ]);
    // No escalation on a recoverable loop.
    expect(completedTools(parts, 'question')).toEqual([]);
  });

  it('escalates via the question tool at the validation cap and dispatches no further validator', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementValidationEscalationScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [['Fix with guidance']]);
    await commandPromise;

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );
    // Plan passes review, then three coder↔validator cycles, then
    // escalation — no fourth validation cycle.
    expect(agents).toEqual([
      'sdd-planner',
      'sdd-reviewer',
      'sdd-coder',
      'sdd-validator',
      'sdd-coder',
      'sdd-validator',
      'sdd-coder',
      'sdd-validator',
    ]);
    expect(completedTools(parts, 'question').length).toBeGreaterThanOrEqual(1);
    expect(agents.filter((a) => a === 'sdd-validator').length).toBe(3);
  }, 15_000);

  it('resumes after escalation by dispatching the coder with user guidance and a fresh validation', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    const guidance = 'Add the missing error-handling branch in the parser';
    mock.reset(autoImplementValidationResumeScenario(guidance));

    const client = server.client;
    const session = await createSession(client, directory);

    // Phase 1: the orchestrator escalates and pauses on the question.
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [['Fix with guidance']]);
    await commandPromise;

    // Phase 2: the user resumes with fix guidance.
    await client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: 'text', text: guidance }] },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    const coderTasks = completedTools(parts, 'task').filter(
      (part) => String(inputField(part, 'subagent_type')) === 'sdd-coder',
    );
    // The post-resume coder dispatch is the last coder dispatch and
    // carries the user's guidance.
    const resumeDispatch = coderTasks[coderTasks.length - 1]!;
    expect(String(inputField(resumeDispatch, 'prompt'))).toContain(guidance);
  }, 15_000);

  it('dispatches the cross-cutting validator after all issues and completes on a clean run', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementCrossCuttingCompleteScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    const taskDispatches = completedTools(parts, 'task');
    const dispatchPrompts = taskDispatches.map((part) => String(inputField(part, 'prompt')));

    // Four per-issue stages, then the cross-cutting validator loads
    // `prd-validate` (not `prd-validate-issue`).
    expect(dispatchPrompts).toEqual([
      'load prd-issue-to-plan via sdd-command and follow it',
      'load prd-review-plan via sdd-command and follow it',
      'load prd-implement-issue via sdd-command and follow it',
      'load prd-validate-issue via sdd-command and follow it',
      'load prd-validate via sdd-command and follow it',
    ]);

    // No escalation on a clean cross-cutting run.
    expect(completedTools(parts, 'question')).toEqual([]);
  });

  it('dispatches one coder per open Critical/High finding then re-runs cross-cutting validation', async () => {
    const directory = tempProjectDir(cleanup);
    const openFindings = 2;
    mock.reset(autoImplementCrossCuttingFixScenario(openFindings));

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );

    // Four per-issue stages, first cross-cutting validation, then one
    // coder per open finding, then a re-validation.
    expect(agents).toEqual([
      'sdd-planner',
      'sdd-reviewer',
      'sdd-coder',
      'sdd-validator',
      'sdd-validator',
      'sdd-coder',
      'sdd-coder',
      'sdd-validator',
    ]);

    // No escalation below the cap.
    expect(completedTools(parts, 'question')).toEqual([]);
  });

  it('escalates via the question tool at the cross-cutting cap', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementCrossCuttingEscalationScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [['Fix with guidance']]);
    await commandPromise;

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );

    // Four per-issue stages, then three cross-cutting cycles (validation
    // + coder fix each), then escalation — no fourth cross-cutting
    // validation.
    expect(agents).toEqual([
      'sdd-planner',
      'sdd-reviewer',
      'sdd-coder',
      'sdd-validator',
      'sdd-validator',
      'sdd-coder',
      'sdd-validator',
      'sdd-coder',
      'sdd-validator',
    ]);
    expect(completedTools(parts, 'question').length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  it('resumes after cross-cutting escalation by dispatching the coder with user guidance and a fresh validation', async (ctx) => {
    if (!questionAvailable) ctx.skip();
    const directory = tempProjectDir(cleanup);
    const guidance = 'Fix the race condition in the counter reset logic';
    mock.reset(autoImplementCrossCuttingResumeScenario(guidance));

    const client = server.client;
    const session = await createSession(client, directory);

    // Phase 1: the orchestrator escalates and pauses on the question.
    const commandPromise = runAutoImplement(client, session.id, directory);
    await replyToPendingQuestion(server.url, directory, [['Fix with guidance']]);
    await commandPromise;

    // Phase 2: the user resumes with fix guidance.
    await client.session.prompt({
      path: { id: session.id },
      body: { parts: [{ type: 'text', text: guidance }] },
      query: { directory },
    });

    const parts = await sessionParts(client, session.id, directory);
    const coderTasks = completedTools(parts, 'task').filter(
      (part) => String(inputField(part, 'subagent_type')) === 'sdd-coder',
    );
    // The post-resume coder dispatch is the last coder dispatch and
    // carries the user's guidance.
    const resumeDispatch = coderTasks[coderTasks.length - 1]!;
    expect(String(inputField(resumeDispatch, 'prompt'))).toContain(guidance);
  }, 15_000);
});
