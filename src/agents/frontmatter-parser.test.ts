import { describe, expect, it } from 'vitest';
import { parseAgentFile } from './frontmatter-parser.js';

const EXPLORE = [
  '---',
  'description: Read-only codebase researcher',
  'mode: subagent',
  'hidden: true',
  'tools:',
  '  read: true',
  '  glob: true',
  '  edit: false',
  'permission:',
  '  edit: deny',
  '  bash: deny',
  '---',
  '',
  'You are sdd-explore.',
  '',
].join('\n');

describe('parseAgentFile', () => {
  it('parses a valid agent with nested tools and permission', () => {
    const result = parseAgentFile('sdd-explore', EXPLORE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = result.agent.config;
    expect(config.description).toBe('Read-only codebase researcher');
    expect(config.mode).toBe('subagent');
    expect(config['hidden']).toBe(true);
    expect(config.tools).toEqual({ read: true, glob: true, edit: false });
    expect(config.permission).toEqual({ edit: 'deny', bash: 'deny' });
    expect(config.prompt).toContain('You are sdd-explore.');
  });

  it('fails when description is missing', () => {
    const raw = ['---', 'mode: subagent', '---', '', 'body', ''].join('\n');
    const result = parseAgentFile('bad', raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/description/i);
  });

  it('fails when mode is invalid', () => {
    const raw = ['---', 'description: x', 'mode: captain', '---', '', 'body', ''].join('\n');
    const result = parseAgentFile('bad', raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/mode/i);
  });

  it('fails on an unclosed frontmatter fence', () => {
    const result = parseAgentFile('bad', '---\ndescription: x\nmode: subagent\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/fence/);
  });

  it('trims leading newlines and trailing whitespace from the prompt', () => {
    const result = parseAgentFile('a', EXPLORE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.config.prompt).toBe('You are sdd-explore.\n');
  });
});
