import { describe, expect, it } from 'vitest';

import {
  autoSelect,
  rankFor,
  SUBAGENT_RECOMMENDATIONS,
  type AgentRecommendation,
  type RecommendableModel,
} from './recommend.js';

/** Minimal fixture model — the engine is generic over `RecommendableModel`. */
function model(id: string, name: string = id): RecommendableModel {
  return { id, name };
}

/** Build a fixture agent recommendation (independent of the shipped table). */
function rec(
  agent: string,
  keywords: readonly string[],
  tier: 'cheap' | 'strong',
): AgentRecommendation {
  return { agent, keywords, tier };
}

describe('rankFor', () => {
  it('places recommended models before non-matching and marks them recommended', () => {
    const r = rec('sdd-coder', ['deepseek'], 'strong');
    const models = [model('claude-3'), model('deepseek-chat'), model('gpt-4o')];
    const ranked = rankFor(r, models);
    expect(ranked.map((x) => x.model.id)).toEqual([
      'deepseek-chat', // recommended first
      'claude-3', // then non-recommended in input order
      'gpt-4o',
    ]);
    expect(ranked[0].recommended).toBe(true);
    expect(ranked[0].matchedKeyword).toBe('deepseek');
    expect(ranked[1].recommended).toBe(false);
    expect(ranked[1].matchedKeyword).toBeUndefined();
    expect(ranked[2].recommended).toBe(false);
    expect(ranked[2].matchedKeyword).toBeUndefined();
  });

  it('ranks by keyword declaration order: [deepseek, mimo] with both available ranks deepseek first', () => {
    const r = rec('sdd-reviewer', ['deepseek', 'mimo'], 'strong');
    const models = [model('mimo-7b'), model('deepseek-reasoner')];
    const ranked = rankFor(r, models);
    expect(ranked.map((x) => x.model.id)).toEqual([
      'deepseek-reasoner', // earlier keyword = higher priority
      'mimo-7b',
    ]);
    expect(ranked[0].matchedKeyword).toBe('deepseek');
    expect(ranked[1].matchedKeyword).toBe('mimo');
  });

  it('matches keywords case-insensitively as substrings of the model id (primary signal)', () => {
    const r = rec('sdd-coder', ['deepseek'], 'strong');
    const ranked = rankFor(r, [model('SomeProvider/DeepSeek-Chat')]);
    expect(ranked[0].recommended).toBe(true);
    expect(ranked[0].matchedKeyword).toBe('deepseek');
  });

  it('matches the display name (secondary signal) when the id does not contain the keyword', () => {
    const r = rec('sdd-plan-reviewer', ['mimo'], 'cheap');
    const m = model('xiaomi-coder-v1', 'MiMo Instruct');
    const ranked = rankFor(r, [m]);
    expect(ranked[0].recommended).toBe(true);
    expect(ranked[0].matchedKeyword).toBe('mimo');
  });

  it('preserves input order among models sharing the same matched keyword (stable within a tier)', () => {
    const r = rec('sdd-coder', ['deepseek'], 'strong');
    const models = [model('deepseek-coder'), model('deepseek-chat'), model('deepseek-reasoner')];
    const ranked = rankFor(r, models);
    expect(ranked.map((x) => x.model.id)).toEqual([
      'deepseek-coder',
      'deepseek-chat',
      'deepseek-reasoner',
    ]);
    for (const x of ranked) {
      expect(x.recommended).toBe(true);
      expect(x.matchedKeyword).toBe('deepseek');
    }
  });

  it('preserves input order of non-recommended models (stable)', () => {
    const r = rec('sdd-coder', ['claude'], 'strong');
    const models = [model('gpt-4o'), model('gemini-flash'), model('mimo-7b')];
    const ranked = rankFor(r, models);
    expect(ranked.map((x) => x.model.id)).toEqual(['gpt-4o', 'gemini-flash', 'mimo-7b']);
    for (const x of ranked) {
      expect(x.recommended).toBe(false);
      expect(x.matchedKeyword).toBeUndefined();
    }
  });

  it('returns an empty array for an empty models list', () => {
    const r = rec('sdd-coder', ['deepseek'], 'strong');
    expect(rankFor(r, [])).toEqual([]);
  });

  it('marks all models non-recommended when no keyword matches any model', () => {
    const r = rec('sdd-coder', ['deepseek'], 'strong');
    const models = [model('claude-3'), model('gpt-4o')];
    const ranked = rankFor(r, models);
    expect(ranked.map((x) => x.model.id)).toEqual(['claude-3', 'gpt-4o']);
    for (const x of ranked) {
      expect(x.recommended).toBe(false);
      expect(x.matchedKeyword).toBeUndefined();
    }
  });
});

describe('autoSelect', () => {
  it('selects the first available recommended match', () => {
    const agents = [rec('sdd-coder', ['deepseek'], 'strong')];
    const models = [model('deepseek-chat'), model('claude-3')];
    const sel = autoSelect(agents, models, {});
    expect(sel).toHaveLength(1);
    expect(sel[0]).toEqual({
      agent: 'sdd-coder',
      status: 'selected',
      model: { id: 'deepseek-chat', name: 'deepseek-chat' },
      reason: 'recommended',
    });
  });

  it('selects deepseek over mimo when both match a strong agent', () => {
    const agents = [rec('sdd-reviewer', ['deepseek', 'mimo'], 'strong')];
    const models = [model('mimo-7b'), model('deepseek-reasoner')];
    const sel = autoSelect(agents, models, {});
    const s = sel[0];
    expect(s.status).toBe('selected');
    if (s.status !== 'selected') throw new Error('unreachable');
    expect(s.reason).toBe('recommended');
    if (s.reason !== 'recommended') throw new Error('unreachable');
    expect(s.model.id).toBe('deepseek-reasoner');
  });

  it('cheap tier falls back to small_model when no keyword matches', () => {
    const agents = [rec('sdd-explore', ['mimo'], 'cheap')];
    const models = [model('claude-3')]; // no match
    const sel = autoSelect(agents, models, {
      small_model: 'anthropic/claude-3',
      model: 'openai/gpt-4o',
    });
    expect(sel[0]).toEqual({
      agent: 'sdd-explore',
      status: 'selected',
      value: 'anthropic/claude-3',
      reason: 'fallback',
    });
  });

  it('cheap tier falls back to model when small_model is unset (two-level chain)', () => {
    const agents = [rec('sdd-explore', ['mimo'], 'cheap')];
    const models = [model('claude-3')]; // no match
    const sel = autoSelect(agents, models, { model: 'openai/gpt-4o' });
    expect(sel[0]).toEqual({
      agent: 'sdd-explore',
      status: 'selected',
      value: 'openai/gpt-4o',
      reason: 'fallback',
    });
  });

  it('strong tier falls back to model when no keyword matches', () => {
    const agents = [rec('sdd-coder', ['deepseek'], 'strong')];
    const models = [model('claude-3')]; // no match
    const sel = autoSelect(agents, models, { model: 'anthropic/claude-3' });
    expect(sel[0]).toEqual({
      agent: 'sdd-coder',
      status: 'selected',
      value: 'anthropic/claude-3',
      reason: 'fallback',
    });
  });

  it('strong tier does NOT consult small_model as its fallback (tier isolation)', () => {
    // A strong agent with small_model set but model unset must NOT fall
    // back to small_model — the strong fallback is `model` only.
    const agents = [rec('sdd-coder', ['deepseek'], 'strong')];
    const models = [model('claude-3')]; // no match
    const sel = autoSelect(agents, models, { small_model: 'cheap/fast' });
    expect(sel[0]).toEqual({ agent: 'sdd-coder', status: 'unset' });
  });

  it('leaves the agent unset when no keyword matches and no default exists', () => {
    const cheap = rec('sdd-explore', ['mimo'], 'cheap');
    const strong = rec('sdd-coder', ['deepseek'], 'strong');
    const sel = autoSelect([cheap, strong], [model('claude-3')], {});
    expect(sel[0]).toEqual({ agent: 'sdd-explore', status: 'unset' });
    expect(sel[1]).toEqual({ agent: 'sdd-coder', status: 'unset' });
  });

  it('returns one selection per agent in input order', () => {
    const agents = [
      rec('sdd-planner', ['deepseek'], 'strong'),
      rec('sdd-explore', ['mimo'], 'cheap'),
      rec('sdd-coder', ['qwen'], 'strong'),
    ];
    const models = [model('deepseek-chat'), model('mimo-7b'), model('qwen-coder')];
    const sel = autoSelect(agents, models, {});
    expect(sel.map((s) => s.agent)).toEqual(['sdd-planner', 'sdd-explore', 'sdd-coder']);
    for (const s of sel) {
      expect(s.status).toBe('selected');
      if (s.status !== 'selected') throw new Error('unreachable');
      expect(s.reason).toBe('recommended');
    }
  });

  it('never guesses a model: unset carries only agent + status (no model/value)', () => {
    const agents = [rec('sdd-coder', ['deepseek'], 'strong')];
    const sel = autoSelect(agents, [model('claude-3')], {});
    // `toEqual` with a 2-key object proves no `model`/`value`/`reason` keys
    // are present on the `unset` variant — i.e. the wizard never got a
    // guessed model value to write.
    expect(sel[0]).toEqual({ agent: 'sdd-coder', status: 'unset' });
  });
});

describe('SUBAGENT_RECOMMENDATIONS', () => {
  it('curates exactly the six shipped SDD subagents', () => {
    expect(SUBAGENT_RECOMMENDATIONS).toHaveLength(6);
    expect(SUBAGENT_RECOMMENDATIONS.map((r) => r.agent).sort()).toEqual(
      [
        'sdd-coder',
        'sdd-explore',
        'sdd-plan-reviewer',
        'sdd-planner',
        'sdd-reviewer',
        'sdd-validator',
      ].sort(),
    );
  });

  it('assigns exactly two cheap-tier agents (the read-only researchers)', () => {
    const cheap = SUBAGENT_RECOMMENDATIONS.filter((r) => r.tier === 'cheap');
    expect(cheap).toHaveLength(2);
    expect(cheap.map((r) => r.agent).sort()).toEqual(['sdd-explore', 'sdd-plan-reviewer']);
  });

  it('assigns exactly four strong-tier agents', () => {
    const strong = SUBAGENT_RECOMMENDATIONS.filter((r) => r.tier === 'strong');
    expect(strong).toHaveLength(4);
    expect(strong.map((r) => r.agent).sort()).toEqual([
      'sdd-coder',
      'sdd-planner',
      'sdd-reviewer',
      'sdd-validator',
    ]);
  });

  it('every keyword list is non-empty and has no duplicated priority', () => {
    for (const r of SUBAGENT_RECOMMENDATIONS) {
      expect(r.keywords.length).toBeGreaterThan(0);
      expect(new Set(r.keywords).size).toBe(r.keywords.length);
    }
  });

  it('drives autoSelect for the shipped table — every agent selects its recommended match from a covering fixture', () => {
    // A fixture covering every shipped keyword (deepseek, qwen, mimo,
    // gemini) so every shipped agent selects a recommended model (no
    // fallback/unset needed) — verifying the shipped table flows through
    // autoSelect end-to-end.
    const models = [
      model('deepseek-chat'),
      model('qwen-coder'),
      model('mimo-7b'),
      model('gemini-flash'),
    ];
    const sel = autoSelect(SUBAGENT_RECOMMENDATIONS, models, {});
    expect(sel).toHaveLength(6);
    for (const s of sel) {
      expect(s.status).toBe('selected');
      if (s.status !== 'selected') throw new Error('unreachable');
      expect(s.reason).toBe('recommended');
    }
  });
});
