import { describe, expect, it, vi } from 'vitest';
import type { Model } from '@opencode-ai/sdk';
import { promptAgentModel } from './agent-model-select.js';
import { SUBAGENT_RECOMMENDATIONS, type AgentRecommendation } from './recommend.js';

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

const sddBuild = SUBAGENT_RECOMMENDATIONS.find(
  (r) => r.agent === 'sdd-build',
) as AgentRecommendation;

describe('promptAgentModel', () => {
  it('returns null without calling select when models is empty', async () => {
    const selectAgentModel = vi.fn();
    const result = await promptAgentModel('sdd-build', [], sddBuild, {
      selectAgentModel,
    });
    expect(result).toBeNull();
    expect(selectAgentModel).not.toHaveBeenCalled();
  });

  it('sorts recommended models first by keyword declaration order + badges them', async () => {
    const deepseek = modelStub({ id: 'deepseek-chat', providerID: 'deepseek' });
    const qwen = modelStub({ id: 'qwen-coder', providerID: 'qwen' });
    const other = modelStub({ id: 'gpt-4o', providerID: 'openai' });
    const selectAgentModel = vi.fn().mockResolvedValue(deepseek);
    const result = await promptAgentModel('sdd-build', [other, qwen, deepseek], sddBuild, {
      selectAgentModel,
    });
    expect(result).toBe(deepseek);
    const config = selectAgentModel.mock.calls[0]?.[0] as {
      choices: Array<{ value: Model; name: string; recommended: boolean }>;
    };
    // Recommended [deepseek (kw0), qwen (kw1)] first by keyword priority;
    // non-recommended [gpt-4o] last in input order.
    expect(config.choices.map((c) => c.value.id)).toEqual([
      'deepseek-chat',
      'qwen-coder',
      'gpt-4o',
    ]);
    expect(config.choices[0]?.name).toContain('[recommended]');
    expect(config.choices[1]?.name).toContain('[recommended]');
    expect(config.choices[2]?.name).not.toContain('[recommended]');
    expect(config.choices[0]?.recommended).toBe(true);
    expect(config.choices[2]?.recommended).toBe(false);
  });

  it('returns the chosen Model object directly (no path-lookup)', async () => {
    const deepseek = modelStub({ id: 'deepseek-chat', providerID: 'deepseek' });
    const selectAgentModel = vi.fn().mockResolvedValue(deepseek);
    const result = await promptAgentModel('sdd-build', [deepseek], sddBuild, {
      selectAgentModel,
    });
    expect(result).toBe(deepseek);
  });

  it('returns null when select rejects with ExitPromptError (Ctrl-C -> cancel)', async () => {
    const exitError = new Error('User pressed Ctrl-C');
    exitError.name = 'ExitPromptError';
    const selectAgentModel = vi.fn().mockRejectedValue(exitError);
    const result = await promptAgentModel(
      'sdd-build',
      [modelStub({ id: 'deepseek-chat', providerID: 'deepseek' })],
      sddBuild,
      { selectAgentModel },
    );
    expect(result).toBeNull();
  });

  it('rethrows non-ExitPromptError failures so main can surface them as non-zero exits', async () => {
    const selectAgentModel = vi.fn().mockRejectedValue(new Error('broken TTY'));
    await expect(
      promptAgentModel(
        'sdd-build',
        [modelStub({ id: 'deepseek-chat', providerID: 'deepseek' })],
        sddBuild,
        { selectAgentModel },
      ),
    ).rejects.toThrow('broken TTY');
  });
});
