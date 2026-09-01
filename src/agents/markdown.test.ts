import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAgentFile } from './frontmatter-parser.js';

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'agents');

describe('sdd-explore agent asset', () => {
  it('parses to a hidden read-only subagent with the SDD toolset', async () => {
    const raw = await readFile(join(assetsDir, 'sdd-explore.md'), 'utf8');
    const result = parseAgentFile('sdd-explore', raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = result.agent.config;
    expect(config.description).toBeTruthy();
    expect(config.mode).toBe('subagent');
    expect(config['hidden']).toBe(true);
    const perm = config.permission as Record<string, unknown> | undefined;
    expect(perm?.read).toBe('allow');
    expect(perm?.glob).toBe('allow');
    expect(perm?.grep).toBe('allow');
    expect(perm?.websearch).toBe('allow');
    expect(perm?.webfetch).toBe('allow');
    expect(perm?.edit).toBe('deny');
    expect(perm?.bash).toBe('deny');
    expect(perm?.task).toBe('deny');
    // sdd-command explicitly denied, reinforcing the global permission deny.
    expect(perm?.['sdd-command']).toBe('deny');
    expect(config.description).toMatch(/researcher/i);
    expect(config.prompt).toBeTruthy();
    expect(config.prompt ?? '').toMatch(/specializ/i);
  });
});

describe('sdd-plan-reviewer agent asset', () => {
  it('parses to a hidden read-only plan-reviewer subagent', async () => {
    const raw = await readFile(join(assetsDir, 'sdd-plan-reviewer.md'), 'utf8');
    const result = parseAgentFile('sdd-plan-reviewer', raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = result.agent.config;
    expect(config.description).toBeTruthy();
    expect(config.mode).toBe('subagent');
    expect(config['hidden']).toBe(true);
    const perm = config.permission as Record<string, unknown> | undefined;
    expect(perm?.read).toBe('allow');
    expect(perm?.glob).toBe('allow');
    expect(perm?.grep).toBe('allow');
    expect(perm?.websearch).toBe('allow');
    expect(perm?.webfetch).toBe('allow');
    expect(perm?.edit).toBe('deny');
    expect(perm?.bash).toBe('deny');
    expect(perm?.task).toBe('deny');
    // sdd-command explicitly denied, reinforcing the global permission deny.
    expect(perm?.['sdd-command']).toBe('deny');
    expect(config.description).toMatch(/plan.*review|review.*plan/i);
    expect(config.prompt).toBeTruthy();
  });
});

const WORKERS = ['sdd-planner', 'sdd-reviewer', 'sdd-coder', 'sdd-validator'] as const;

const WORKER_DESCRIPTION_SPECIALTY: Record<string, RegExp> = {
  'sdd-planner': /plan/i,
  'sdd-reviewer': /review/i,
  'sdd-coder': /implement|cod/i,
  'sdd-validator': /verif|valid/i,
};

const WORKER_TASK_ALLOWLIST: Record<string, Record<string, string>> = {
  'sdd-planner': { '*': 'deny', 'sdd-explore': 'allow' },
  'sdd-reviewer': { '*': 'deny', 'sdd-explore': 'allow', 'sdd-plan-reviewer': 'allow' },
  'sdd-coder': { '*': 'deny', 'sdd-explore': 'allow' },
  'sdd-validator': { '*': 'deny', 'sdd-explore': 'allow' },
};

describe.each(WORKERS)('%s worker asset', (name) => {
  it('parses to a hidden subagent with sdd-command allowed and a scoped task allowlist', async () => {
    const raw = await readFile(join(assetsDir, `${name}.md`), 'utf8');
    const result = parseAgentFile(name, raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = result.agent.config;
    expect(config.mode).toBe('subagent');
    expect(config['hidden']).toBe(true);
    const perm = config.permission as Record<string, unknown> | undefined;
    expect(perm?.read).toBe('allow');
    expect(perm?.glob).toBe('allow');
    expect(perm?.grep).toBe('allow');
    expect(perm?.edit).toBe('allow');
    expect(perm?.bash).toBe('allow');
    expect(perm?.websearch).toBe('allow');
    expect(perm?.webfetch).toBe('allow');
    // sdd-command allowed per-agent, overriding the global permission deny.
    expect(perm?.['sdd-command']).toBe('allow');
    expect(config.tools).toBeUndefined();
    const task = perm?.task;
    expect(task).toEqual(WORKER_TASK_ALLOWLIST[name]);
  });

  it('has a prompt-minimal body with no SDD workflow prose', async () => {
    const raw = await readFile(join(assetsDir, `${name}.md`), 'utf8');
    const result = parseAgentFile(name, raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prompt = result.agent.config.prompt ?? '';
    expect(prompt).toMatch(/sdd-command/);
    expect(prompt).toMatch(/sdd-explore/);
    expect(prompt).toMatch(/specializ/i);
    expect(prompt).not.toMatch(/PRD|plan-review|implement-validate|orchestrat/i);
  });

  it('has a non-circular description naming its specialty', async () => {
    const raw = await readFile(join(assetsDir, `${name}.md`), 'utf8');
    const result = parseAgentFile(name, raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const desc = result.agent.config.description ?? '';
    expect(desc).toMatch(WORKER_DESCRIPTION_SPECIALTY[name]);
  });
});

describe('sdd-build agent asset is not shipped', () => {
  it('does not define the removed orchestrator agent', async () => {
    await expect(readFile(join(assetsDir, 'sdd-build.md'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
