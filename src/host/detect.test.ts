import { describe, expect, it } from 'vitest';
import { isV2Host } from './detect.js';
import { createV2ContextStub } from '../../test/v2-context.js';

describe('isV2Host', () => {
  it('accepts a context with the V2 editor transforms', () => {
    expect(isV2Host(createV2ContextStub().ctx)).toBe(true);
  });

  it('rejects null, undefined, and primitives', () => {
    expect(isV2Host(null)).toBe(false);
    expect(isV2Host(undefined)).toBe(false);
    expect(isV2Host('v2')).toBe(false);
    expect(isV2Host(42)).toBe(false);
  });

  it('rejects objects missing any transform', () => {
    const transform = async () => ({ dispose: async () => undefined });
    expect(isV2Host({})).toBe(false);
    expect(isV2Host({ agent: { transform } })).toBe(false);
    expect(isV2Host({ agent: { transform }, command: { transform } })).toBe(false);
    expect(isV2Host({ agent: { transform }, command: { transform }, tool: {} })).toBe(false);
  });

  it('rejects objects whose transforms are not functions', () => {
    expect(
      isV2Host({ agent: { transform: 1 }, command: { transform: 2 }, tool: { transform: 3 } }),
    ).toBe(false);
  });
});
