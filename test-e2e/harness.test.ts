import { afterEach, describe, expect, it } from 'vitest';
import { isolateServerAuth } from './harness.js';

const KEYS = ['OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME'] as const;

/** Restore any auth env vars this file mutates, so tests stay isolated. */
afterEach(() => {
  for (const key of KEYS) {
    delete process.env[key];
  }
});

describe('isolateServerAuth', () => {
  it('removes inherited OPENCODE_SERVER_* auth vars and restores them', () => {
    process.env.OPENCODE_SERVER_PASSWORD = 'secret-from-parent-session';
    process.env.OPENCODE_SERVER_USERNAME = 'parent-user';

    const isolated = isolateServerAuth();

    expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
    expect(process.env.OPENCODE_SERVER_USERNAME).toBeUndefined();

    isolated.restore();

    expect(process.env.OPENCODE_SERVER_PASSWORD).toBe('secret-from-parent-session');
    expect(process.env.OPENCODE_SERVER_USERNAME).toBe('parent-user');
  });

  it('is a no-op restore when the vars were never set', () => {
    for (const key of KEYS) {
      delete process.env[key];
    }

    const isolated = isolateServerAuth();
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
    expect(process.env.OPENCODE_SERVER_USERNAME).toBeUndefined();

    expect(() => isolated.restore()).not.toThrow();
    expect(process.env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
  });
});
