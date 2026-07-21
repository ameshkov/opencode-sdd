/**
 * E2E: `prd-auto-implement` resume-after-interruption behaviour.
 * Drives the command through a real opencode server against a local mock
 * LLM. These tests verify the resume plumbing — the dispatch sequence a
 * resuming orchestrator emits (skipping validated issues, resuming
 * interrupted implementations) — plus that the resume language in the
 * command template reaches the model. The prompt's actual skip/resume
 * decision logic is HITL-verified.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSession } from './harness.js';
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
  autoImplementResumeInProgressScenario,
  autoImplementResumeMidValidationScenario,
  autoImplementResumeSkipValidatedScenario,
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

describe('prd-auto-implement resume e2e', () => {
  let server: OpencodeServerHandle;
  let mock: MockLlmState;

  beforeAll(async () => {
    const setup = await setupAutoImplementServer(cleanup);
    server = setup.server;
    mock = setup.mock;
  });

  afterAll(() => {
    server?.close();
    mock?.close();
  });

  it('skips validated issues and resumes at the next issue plan gate on re-invocation', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementResumeSkipValidatedScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );
    // Only the resumed issue's four stages are dispatched; the
    // already-validated issues produce no dispatches.
    expect(agents).toEqual(['sdd-planner', 'sdd-reviewer', 'sdd-coder', 'sdd-validator']);

    // The resume language reaches the model — proving the prompt that
    // drives the skip/resume decision was loaded.
    const promptText = capturedPromptText(mock);
    expect(promptText).toContain('Resume');
    expect(promptText).toContain('Validated');
  });

  it('dispatches only the coder (resuming from [x] markers) for an In Progress issue', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementResumeInProgressScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );
    // Resume skips plan and review — only coder + validator.
    expect(agents).toEqual(['sdd-coder', 'sdd-validator']);
    expect(agents).not.toContain('sdd-planner');
    expect(agents).not.toContain('sdd-reviewer');

    const promptText = capturedPromptText(mock);
    expect(promptText).toContain('In Progress');
    expect(promptText).toContain('[x]');
  });

  it('continues the validation loop on resume without resetting persisted counters', async () => {
    const directory = tempProjectDir(cleanup);
    mock.reset(autoImplementResumeMidValidationScenario());

    const client = server.client;
    const session = await createSession(client, directory);
    await runAutoImplement(client, session.id, directory);

    const parts = await sessionParts(client, session.id, directory);
    const agents = completedTools(parts, 'task').map((part) =>
      String(inputField(part, 'subagent_type')),
    );
    // Resume mid-loop: coder fix then validator re-validate.
    expect(agents).toEqual(['sdd-coder', 'sdd-validator']);

    // The counter-preservation contract reaches the model.
    const promptText = capturedPromptText(mock);
    expect(promptText).toContain('preserved');
  });
});
