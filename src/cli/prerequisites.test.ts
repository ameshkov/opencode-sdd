import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  detect,
  INSTALL_OPENCODE_HINT,
  parseOpencodeVersion,
  resolveHost,
  unparseableVersionHint,
  unsupportedOpencodeHint,
  type DetectOk,
} from './prerequisites.js';

/** Build a parsed detection result for host-resolution tests. */
function detected(version: string): DetectOk {
  const parsed = parseOpencodeVersion(version);
  if (parsed === null) {
    throw new Error(`bad fixture version: ${version}`);
  }
  return { ok: true, raw: version, ...parsed };
}

describe('parseOpencodeVersion', () => {
  it('parses a bare V1 version', () => {
    expect(parseOpencodeVersion('1.18.32')).toEqual({
      version: '1.18.32',
      major: 1,
      minor: 18,
      patch: 32,
    });
  });

  it('parses the V2 `opencode vX.Y.Z` form', () => {
    expect(parseOpencodeVersion('opencode v2.0.14')).toEqual({
      version: '2.0.14',
      major: 2,
      minor: 0,
      patch: 14,
    });
  });

  it('drops prerelease and build suffixes', () => {
    expect(parseOpencodeVersion('1.18.29-beta.1+abc')?.version).toBe('1.18.29');
  });

  it('returns null when no triplet is present', () => {
    expect(parseOpencodeVersion('unknown')).toBeNull();
    expect(parseOpencodeVersion('')).toBeNull();
  });
});

describe('resolveHost', () => {
  it('maps 2.x to v2', () => {
    expect(resolveHost(detected('2.0.14'))).toBe('v2');
    expect(resolveHost(detected('2.1.0'))).toBe('v2');
  });

  it('maps 1.18.29 and newer to v1', () => {
    expect(resolveHost(detected('1.18.29'))).toBe('v1');
    expect(resolveHost(detected('1.18.32'))).toBe('v1');
    expect(resolveHost(detected('1.19.0'))).toBe('v1');
  });

  it('rejects V1 below the 1.18.29 floor', () => {
    expect(resolveHost(detected('1.18.28'))).toBeNull();
    expect(resolveHost(detected('1.17.9'))).toBeNull();
  });

  it('rejects 0.x and other majors', () => {
    expect(resolveHost(detected('0.9.9'))).toBeNull();
  });
});

describe('hint messages', () => {
  it('exposes an install-hint message', () => {
    expect(INSTALL_OPENCODE_HINT).toContain('opencode');
    expect(INSTALL_OPENCODE_HINT).toContain('install');
  });

  it('names the floor and both host lines in the unsupported hint', () => {
    const hint = unsupportedOpencodeHint(detected('1.18.23'));
    expect(hint).toContain('1.18.23');
    expect(hint).toContain('1.18.29');
    expect(hint).toContain('2.x');
  });

  it('includes the raw output in the unparseable hint', () => {
    expect(unparseableVersionHint('nonsense')).toContain('nonsense');
  });
});

describe('detect (with injected exec)', () => {
  it('returns ok + parsed fields when opencode --version succeeds', () => {
    const result = detect({
      execVersion: () => 'opencode 1.18.29\n',
    });
    expect(result).toEqual({
      ok: true,
      raw: 'opencode 1.18.29',
      version: '1.18.29',
      major: 1,
      minor: 18,
      patch: 29,
    });
  });

  it('parses the V2 version banner', () => {
    expect(detect({ execVersion: () => 'opencode v2.0.14\n' })).toEqual({
      ok: true,
      raw: 'opencode v2.0.14',
      version: '2.0.14',
      major: 2,
      minor: 0,
      patch: 14,
    });
  });

  it('returns a not-found failure when the binary is missing', () => {
    const result = detect({
      execVersion: () => {
        throw new Error('spawn ENOENT');
      },
    });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
  });

  it('returns an unparseable failure when the output has no version', () => {
    expect(detect({ execVersion: () => 'what is this\n' })).toEqual({
      ok: false,
      reason: 'unparseable',
      raw: 'what is this',
    });
  });
});

describe('detect (default exec binding)', () => {
  it('probes opencode --version with the Windows shell option', () => {
    vi.mocked(execFileSync).mockReturnValue('1.18.32\n');
    const result = detect();
    expect(result).toEqual({
      ok: true,
      raw: '1.18.32',
      version: '1.18.32',
      major: 1,
      minor: 18,
      patch: 32,
    });
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      'opencode',
      ['--version'],
      expect.objectContaining({
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'ignore'],
        // A stuck/corrupted binary must surface as a failure within a
        // human-noticeable window rather than hanging the CLI forever.
        timeout: 10_000,
      }),
    );
  });

  it('returns a not-found failure when the default probe throws', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    expect(detect()).toEqual({ ok: false, reason: 'not-found' });
  });
});
