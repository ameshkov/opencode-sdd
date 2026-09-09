import { describe, expect, it, vi } from 'vitest';
import { main } from './install.js';

/**
 * A canned {@link OwnPackageInfo} for the `readOwnPackage` injection:
 * the version comes from the test, so the printed line is predictable.
 */
function own(version: string): { root: string; version: string; prerelease: boolean } {
  return { root: '/tmp/opencode-sdd', version, prerelease: version.includes('-') };
}

describe('main (--version)', () => {
  it('exits 0 and prints the running version on --version', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['--version'], { readOwnPackage: () => own('1.2.1') });
    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith('opencode-sdd 1.2.1');
    // Informational short-circuit: no detection, probe, or patch runs
    // (the real `detect` would otherwise fail and print to stderr).
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });

  it('exits 0 and prints the version on install --version', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install', '--version'], {
      readOwnPackage: () => own('1.2.1-canary.abc123'),
    });
    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith('opencode-sdd 1.2.1-canary.abc123');
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });

  it('exits 1 when the version cannot be determined', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['--version'], { readOwnPackage: () => null });
    expect(exit).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('cannot determine the version'));
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });
});
