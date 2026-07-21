import { describe, expect, it } from 'vitest';
import { applyAgentModels } from './agent-model-patch.js';

const two = new Map<string, string>([
  ['sdd-coder', 'anthropic/claude-3-5-sonnet'],
  ['sdd-explore', 'openai/gpt-4o-mini'],
]);

describe('applyAgentModels (per-subagent model step)', () => {
  it('creates the agent key + each agent.<name> object when absent', () => {
    const current = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sdd"]
}`;
    const { patchedText, changed } = applyAgentModels(current, two);
    expect(changed).toBe(true);
    const parsed = JSON.parse(patchedText) as {
      agent: Record<string, { model: string }>;
    };
    expect(parsed.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
    expect(parsed.agent['sdd-explore'].model).toBe('openai/gpt-4o-mini');
    // Existing top-level keys keep their relative order; agent is appended.
    const keys = Object.keys(parsed);
    expect(keys.indexOf('$schema')).toBeLessThan(keys.indexOf('plugin'));
    expect(keys.indexOf('plugin')).toBeLessThan(keys.indexOf('agent'));
  });

  it('shallow-merges model into an existing agent.<name>, preserving other fields', () => {
    const current = `{
  "agent": {
    "sdd-coder": {
      "temperature": 0.2,
      "model": "old/model"
    }
  }
}`;
    const sel = new Map([['sdd-coder', 'anthropic/claude-3-5-sonnet']]);
    const { patchedText, changed } = applyAgentModels(current, sel);
    expect(changed).toBe(true);
    const parsed = JSON.parse(patchedText) as {
      agent: { 'sdd-coder': { temperature: number; model: string } };
    };
    // temperature survives (shallow-merge, not re-serialization).
    expect(parsed.agent['sdd-coder'].temperature).toBe(0.2);
    // model overwritten with the new value.
    expect(parsed.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
  });

  it('preserves comments and the relative key order of a .jsonc', () => {
    const current = `{
  // top-of-file comment
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    // an agent comment
    "sdd-coder": { "model": "old/model" }
  }
}`;
    const sel = new Map([['sdd-coder', 'anthropic/claude-3-5-sonnet']]);
    const { patchedText } = applyAgentModels(current, sel);
    expect(patchedText).toContain('// top-of-file comment');
    expect(patchedText).toContain('// an agent comment');
    expect(patchedText).toContain('"anthropic/claude-3-5-sonnet"');
  });

  it('is a no-op when every selected model already equals the current value (idempotency)', () => {
    const current = `{
  "agent": {
    "sdd-coder": { "model": "anthropic/claude-3-5-sonnet" },
    "sdd-explore": { "model": "openai/gpt-4o-mini" }
  }
}`;
    const { patchedText, changed } = applyAgentModels(current, two);
    expect(changed).toBe(false);
    expect(patchedText).toBe(current); // byte-for-byte unchanged
  });

  it('writes only the changed agent when one of two differs (re-run upgrade)', () => {
    const current = `{
  "agent": {
    "sdd-coder": { "model": "old/coder" },
    "sdd-explore": { "model": "openai/gpt-4o-mini" }
  }
}`;
    const { patchedText, changed } = applyAgentModels(current, two);
    expect(changed).toBe(true);
    const parsed = JSON.parse(patchedText) as {
      agent: {
        'sdd-coder': { model: string };
        'sdd-explore': { model: string };
      };
    };
    expect(parsed.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
    // sdd-explore unchanged (already equal — its entry is untouched).
    expect(parsed.agent['sdd-explore'].model).toBe('openai/gpt-4o-mini');
  });

  it('is a no-op (changed=false) on an empty models map', () => {
    const current = `{ "plugin": ["opencode-sdd"] }`;
    const { patchedText, changed } = applyAgentModels(current, new Map());
    expect(changed).toBe(false);
    expect(patchedText).toBe(current);
  });

  it('throws a clear error when the source is malformed JSONC', () => {
    expect(() => applyAgentModels(`{ "agent": [ }`, two)).toThrow(/malformed JSONC/i);
  });

  it('includes the target path in the error message when provided', () => {
    expect(() =>
      applyAgentModels(`{ "agent": [ }`, two, {
        targetPath: '/repo/opencode.jsonc',
      }),
    ).toThrow(/\/repo\/opencode\.jsonc/);
  });
});
