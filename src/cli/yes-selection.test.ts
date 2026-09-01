import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from '@opencode-ai/sdk';
import { buildYesSelection, formatModelValue } from './yes-selection.js';
import type { ProbeClient } from './model-probe.js';

const AUTH_KEYS = ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME'] as const;
afterEach(() => {
  for (const key of AUTH_KEYS) delete process.env[key];
});

/** Mirror of model-probe.test.ts's modelStub (self-contained for this file). */
function modelStub(overrides: Partial<Model> & { id: string; providerID: string }): Model {
  return {
    id: overrides.id,
    providerID: overrides.providerID,
    api: overrides.api ?? { id: 'stub-api', url: 'http://stub', npm: '@stub/api' },
    name: overrides.name ?? overrides.id,
    capabilities: overrides.capabilities ?? {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
    },
    cost: overrides.cost ?? { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: overrides.limit ?? { context: 128_000, output: 4_096 },
    status: overrides.status ?? 'active',
    options: overrides.options ?? {},
    headers: overrides.headers ?? {},
  };
}

/** Mirror of model-probe.test.ts's stubClient surface (incl. the ProbeClient
 * return type — the explicit annotation validates the stub shape against the
 * SDK-mirrored type rather than inferring it from the object literal, so a
 * subtly wrong stub fails typecheck at definition, not at the call site). */
function stubClient(
  models: Record<string, Model>,
  defaults: { model?: string; small_model?: string },
): ProbeClient {
  return {
    config: {
      providers: async () => ({
        data: { providers: [{ id: 'stub', name: 'Stub', models }], default: {} },
      }),
      get: async () => ({ data: defaults }),
    },
  };
}

describe('formatModelValue', () => {
  it('formats a Model as `${providerID}/${id}`', () => {
    const m = modelStub({
      id: 'claude-3-5-sonnet',
      providerID: 'anthropic',
      name: 'Claude 3.5 Sonnet',
    });
    expect(formatModelValue(m)).toBe('anthropic/claude-3-5-sonnet');
  });

  it('produces the same shape as the fallback path already writes (parity)', () => {
    const m = modelStub({ id: 'gpt-4o-mini', providerID: 'openai' });
    expect(formatModelValue(m)).toBe('openai/gpt-4o-mini');
  });
});

describe('buildYesSelection', () => {
  it('auto-selects the first matching recommended model per subagent + formats provider/model', async () => {
    // Both `deepseek-chat` and `qwen-coder` are available; the strong
    // agents (sdd-planner, sdd-reviewer, sdd-coder, sdd-validator)
    // all match `deepseek` first per the shipped SUBAGENT_RECOMMENDATIONS
    // table (keywords: ['deepseek', 'qwen'], tier: 'strong').
    const models: Record<string, Model> = {
      'deepseek-chat': modelStub({ id: 'deepseek-chat', providerID: 'deepseek' }),
      'qwen-coder': modelStub({ id: 'qwen-coder', providerID: 'qwen' }),
    };
    const result = await buildYesSelection({
      createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
      createClient: () => stubClient(models, {}),
    });
    expect(result.degraded).toBe(false);
    // The two cheap-tier agents (sdd-explore, sdd-plan-reviewer) have
    // keywords ['mimo','gemini'] — neither matches deepseek-chat/qwen-coder,
    // and the fixture's empty defaults `{}` mean no small_model/model
    // fallback — both go `unset` and each emit an AGENT_UNSET_WARNING.
    expect(result.warnings).toHaveLength(2);
    expect(
      result.warnings.every((w) => w.includes('sdd-explore') || w.includes('sdd-plan-reviewer')),
    ).toBe(true);
    expect(result.selection.models).toBeDefined();
    const map = result.selection.models!;
    // deepseek beats qwen (declaration-order priority).
    expect(map.get('sdd-planner')).toBe('deepseek/deepseek-chat');
    expect(map.get('sdd-coder')).toBe('deepseek/deepseek-chat');
    expect(map.get('sdd-explore')).toBeUndefined();
  });

  it('deepseek chosen over qwen when both available (keyword priority)', async () => {
    const models: Record<string, Model> = {
      'qwen-coder': modelStub({ id: 'qwen-coder', providerID: 'qwen' }),
      'deepseek-chat': modelStub({ id: 'deepseek-chat', providerID: 'deepseek' }),
    };
    const result = await buildYesSelection({
      createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
      createClient: () => stubClient(models, {}),
    });
    expect(result.selection.models?.get('sdd-coder')).toBe('deepseek/deepseek-chat');
  });

  it('cheap tier falls back to small_model then model when no keyword matches', async () => {
    const models: Record<string, Model> = {
      'claude-3': modelStub({ id: 'claude-3', providerID: 'anthropic' }),
    };
    const result = await buildYesSelection({
      createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
      createClient: () =>
        stubClient(models, { small_model: 'anthropic/claude-3', model: 'openai/gpt-4o' }),
    });
    expect(result.selection.models?.get('sdd-explore')).toBe('anthropic/claude-3');
  });

  it('unset agent produces a warning naming the skipped agent + leaves Selection empty for it (wizard never guesses)', async () => {
    const models: Record<string, Model> = {
      'claude-3': modelStub({ id: 'claude-3', providerID: 'anthropic' }),
    };
    const result = await buildYesSelection({
      createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
      createClient: () => stubClient(models, {}),
    });
    expect(result.degraded).toBe(false);
    expect(result.selection.models).toBeUndefined();
    // Each of the six shipped agents produced a warning naming it.
    expect(result.warnings).toHaveLength(6);
    expect(result.warnings.some((w) => w.includes('sdd-explore'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('sdd-coder'))).toBe(true);
    for (const w of result.warnings) {
      expect(w).toMatch(/install:.*unset/i);
    }
  });

  it('probe failure degrades gracefully: empty selection + warning naming the skipped step + degraded=true', async () => {
    const result = await buildYesSelection({
      createServer: async () => {
        throw new Error('opencode binary not found');
      },
      createClient: () => stubClient({}, {}),
    });
    expect(result.degraded).toBe(true);
    expect(result.selection.models).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/install:.*model.*skipped/i);
    expect(result.warnings[0]).toContain('opencode binary not found');
  });

  it('probe zero-models failure also degrades gracefully', async () => {
    const result = await buildYesSelection({
      createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
      createClient: () => stubClient({}, { model: 'p/x' }),
    });
    expect(result.degraded).toBe(true);
    expect(result.selection.models).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/install:.*model.*skipped/i);
  });

  it('mixed: some agents matched, some unset — only the unset produce warnings', async () => {
    // deepseek available (covers the four strong agents); the two cheap
    // agents (sdd-explore, sdd-plan-reviewer) match neither mimo nor
    // gemini and have no small_model fallback -> they go unset.
    const models: Record<string, Model> = {
      'deepseek-chat': modelStub({ id: 'deepseek-chat', providerID: 'deepseek' }),
    };
    const result = await buildYesSelection({
      createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
      createClient: () => stubClient(models, {}),
    });
    expect(result.degraded).toBe(false);
    expect(result.selection.models?.get('sdd-planner')).toBe('deepseek/deepseek-chat');
    expect(result.selection.models?.get('sdd-explore')).toBeUndefined();
    expect(result.warnings).toHaveLength(2); // the two cheap agents only
    expect(
      result.warnings.every((w) => w.includes('sdd-explore') || w.includes('sdd-plan-reviewer')),
    ).toBe(true);
  });
});
