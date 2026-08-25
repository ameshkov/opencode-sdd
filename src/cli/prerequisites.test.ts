import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { detect, INSTALL_OPENCODE_HINT } from './prerequisites.js';

describe('detect (with injected exec)', () => {
  it('returns ok + version when opencode --version succeeds', () => {
    const result = detect({
      execVersion: () => 'opencode 1.18.23\n',
    });
    expect(result).toEqual({ ok: true, version: 'opencode 1.18.23' });
  });

  it('returns { ok: false } when the binary is missing', () => {
    const result = detect({
      execVersion: () => {
        throw new Error('spawn ENOENT');
      },
    });
    expect(result).toEqual({ ok: false });
  });

  it('exposes an install-hint message', () => {
    expect(INSTALL_OPENCODE_HINT).toContain('opencode');
    expect(INSTALL_OPENCODE_HINT).toContain('install');
  });
});

describe('detect (default exec binding)', () => {
  it('probes opencode --version with the Windows shell option', () => {
    vi.mocked(execFileSync).mockReturnValue('opencode 1.18.23\n');
    const result = detect();
    expect(result).toEqual({ ok: true, version: 'opencode 1.18.23' });
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      'opencode',
      ['--version'],
      expect.objectContaining({
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'ignore'],
        // A stuck/corrupted binary must surface as { ok: false } within a
        // human-noticeable window rather than hanging the CLI forever.
        timeout: 10_000,
      }),
    );
  });

  it('returns { ok: false } when the default probe throws', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    expect(detect()).toEqual({ ok: false });
  });
});
