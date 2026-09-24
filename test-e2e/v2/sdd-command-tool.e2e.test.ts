/**
 * V2 `sdd-command` tool behavior: a worker agent can call the tool and gets
 * the loaded command back, while a non-SDD agent cannot see it at all (the
 * per-agent permission deny removes it from the tool snapshot).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockLlm, type MockLlmState } from '../shared/mock-server.js';
import { sddCommandScenario } from '../shared/scenarios.js';
import { createV2Session, promptV2, startV2Host, v2MockConfig, v2ToolCalls } from './harness.js';
import type { V2HostHandle } from './harness.js';

describe('V2 sdd-command tool', () => {
  let host: V2HostHandle;
  let mock: MockLlmState;
  let projectDir: string;

  beforeAll(async () => {
    mock = await createMockLlm([]);
    host = await startV2Host(v2MockConfig(`${mock.url}/v1`));
    projectDir = mkdtempSync(join(tmpdir(), 'sdd-e2e-v2-tool-'));
  });

  afterAll(async () => {
    await host.close();
    mock.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('lets a worker agent load an allowlisted command', async () => {
    mock.reset(sddCommandScenario('prd-validate'));
    const sessionID = await createV2Session(host.client, projectDir, 'sdd-planner');

    await promptV2(host.client, sessionID, 'load prd-validate via sdd-command and follow it');

    const call = (await v2ToolCalls(host.client, sessionID)).find(
      (candidate) => candidate.name === 'sdd-command',
    );
    expect(call?.status).toBe('completed');
    expect(call?.text).toContain('Loaded command "prd-validate" from ');
    expect(call?.text).not.toContain('@opencode-sdd-templates/');
  });

  it('hides sdd-command from non-SDD agents', async () => {
    mock.reset(sddCommandScenario('prd-validate'));
    const sessionID = await createV2Session(host.client, projectDir, 'build');

    await promptV2(host.client, sessionID, 'try to load prd-validate via sdd-command');

    const call = (await v2ToolCalls(host.client, sessionID)).find(
      (candidate) => candidate.name === 'sdd-command',
    );
    expect(call?.status).toBe('error');
    expect(call?.error).toContain('No tool named "sdd-command" is currently available');
  });
});
