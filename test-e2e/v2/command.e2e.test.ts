/**
 * V2 command dispatch: plugin commands are `execute` closures in V2, so the
 * adapter rewrites the template and sends it as a session prompt. This test
 * drives a real command through the in-process host and asserts the mock LLM
 * received the rewritten, argument-substituted template — the V2 equivalent of
 * the V1 `command.e2e.test.ts` template-inlining assertion.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockLlm, type MockLlmState } from '../shared/mock-server.js';
import { createV2Session, runV2Command, startV2Host, v2MockConfig } from './harness.js';
import type { V2HostHandle } from './harness.js';

/** Join every text part of every captured mock request. */
function capturedText(mock: MockLlmState): string {
  const parts: string[] = [];
  for (const { body } of mock.requests) {
    const parsed = body as { messages?: Array<{ content?: unknown }> } | undefined;
    for (const message of parsed?.messages ?? []) {
      const content = message.content;
      if (typeof content === 'string') {
        parts.push(content);
        continue;
      }
      if (Array.isArray(content)) {
        for (const part of content) {
          if (
            part !== null &&
            typeof part === 'object' &&
            (part as { type?: string }).type === 'text'
          ) {
            parts.push((part as { text?: string }).text ?? '');
          }
        }
      }
    }
  }
  return parts.join('\n');
}

describe('V2 command dispatch', () => {
  let host: V2HostHandle;
  let mock: MockLlmState;
  let projectDir: string;

  beforeAll(async () => {
    mock = await createMockLlm([]);
    host = await startV2Host(v2MockConfig(`${mock.url}/v1`));
    projectDir = mkdtempSync(join(tmpdir(), 'sdd-e2e-v2-cmd-'));
  });

  afterAll(async () => {
    await host.close();
    mock.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('runs sdd-spec: rewrites the template, substitutes $ARGUMENTS, and prompts the model', async () => {
    mock.reset([{ type: 'text', text: 'spec done' }]);
    const sessionID = await createV2Session(host.client, projectDir);

    await runV2Command(host.client, sessionID, 'sdd-spec', 'fix the login 500 error');

    const prompt = capturedText(mock);
    // The template was inlined from the bundled asset (a heading unique to
    // plan-template.md) and the portable token was rewritten.
    expect(prompt).toContain('### Patterns to Follow');
    expect(prompt).not.toContain('@opencode-sdd-templates');
    // $ARGUMENTS was substituted by the adapter.
    expect(prompt).toContain('fix the login 500 error');
  });
});
