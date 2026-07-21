import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from '@opencode-ai/sdk';
import { buildInteractiveSelection } from './interactive-selection.js';
import type { ProbeClient } from './model-probe.js';

const AUTH_KEYS = ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME'] as const;
afterEach(() => {
  for (const key of AUTH_KEYS) delete process.env[key];
});

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

describe('buildInteractiveSelection', () => {
  it('probes + per-agent prompt returns the chosen model formatted as provider/model', async () => {
    const deepseek = modelStub({ id: 'deepseek-chat', providerID: 'deepseek' });
    const selectAgentModel = vi.fn().mockResolvedValue(deepseek);
    // Return the same model for every agent call — all 7 agents get prompted
    // (recommended models sorted first, but all models are selectable).
    const result = await buildInteractiveSelection(
      {
        createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
        createClient: () => stubClient({ 'deepseek-chat': deepseek }, {}),
      },
      { selectAgentModel },
    );
    expect(result.degraded).toBe(false);
    expect(result.warnings).toHaveLength(0); // all 7 agents got a model
    expect(selectAgentModel).toHaveBeenCalledTimes(7); // all seven agents prompted
    expect(result.selection.models?.get('sdd-build')).toBe('deepseek/deepseek-chat');
    expect(result.selection.models?.get('sdd-coder')).toBe('deepseek/deepseek-chat');
    expect(result.selection.models?.get('sdd-explore')).toBe('deepseek/deepseek-chat');
  });

  it('recommended-first sorting + badging passed to the prompt (integration with rankFor)', async () => {
    const deepseek = modelStub({ id: 'deepseek-chat', providerID: 'deepseek' });
    const qwen = modelStub({ id: 'qwen-coder', providerID: 'qwen' });
    const selectAgentModel = vi.fn().mockResolvedValue(deepseek);
    await buildInteractiveSelection(
      {
        createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
        createClient: () =>
          stubClient(
            { 'qwen-coder': qwen, 'deepseek-chat': deepseek },
            { small_model: 'qwen/qwen-coder', model: 'qwen/qwen-coder' },
          ),
      },
      { selectAgentModel },
    );
    // First prompt call is for sdd-build (keywords ['deepseek','qwen'], strong).
    const config = selectAgentModel.mock.calls[0]?.[0] as {
      choices: Array<{ value: Model; recommended: boolean; name: string }>;
    };
    expect(config.choices.map((c) => c.value.id)).toEqual([
      'deepseek-chat', // kw0
      'qwen-coder', // kw1
    ]);
    expect(config.choices[0]?.name).toContain('[recommended]');
  });

  it('per-agent cancel (Ctrl-C -> null) emits an AGENT_UNSET_WARNING and skips that agent', async () => {
    const deepseek = modelStub({ id: 'deepseek-chat', providerID: 'deepseek' });
    // First agent (sdd-build) -> cancelled; subsequent agents -> deepseek.
    // All agents get prompted (recommended sorted first); the user can
    // pick any model for any agent. The cheap agents CAN select deepseek
    // even though it's not recommended for them.
    const selectAgentModel = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(deepseek);
    const result = await buildInteractiveSelection(
      {
        createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
        createClient: () => stubClient({ 'deepseek-chat': deepseek }, {}),
      },
      { selectAgentModel },
    );
    expect(result.selection.models?.has('sdd-build')).toBe(false);
    expect(result.warnings.some((w) => w.includes('sdd-build'))).toBe(true);
    // Only the cancelled agent (sdd-build) is unset.
    expect(result.warnings).toHaveLength(1);
  });

  it('probe failure degrades gracefully: empty selection + warning + degraded=true', async () => {
    const result = await buildInteractiveSelection({
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

  it('all agents selectable even when no keywords match (interactive allows any model)', async () => {
    const claude = modelStub({ id: 'claude-3', providerID: 'anthropic' });
    const result = await buildInteractiveSelection(
      {
        createServer: async () => ({ url: 'http://127.0.0.1:0', close: vi.fn() }),
        createClient: () => stubClient({ 'claude-3': claude }, {}),
      },
      // No agent matches (claude is neither deepseek/qwen nor mimo/gemini),
      // but a prompt IS shown per agent (ranked.length === models.length > 0).
      { selectAgentModel: vi.fn().mockResolvedValue(claude) },
    );
    // All 7 agents get the claude model (recommended=false, but selectable).
    expect(result.selection.models?.size).toBe(7);
    expect(result.warnings).toHaveLength(0);
  });
});
