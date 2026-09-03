import { describe, expect, it } from 'vitest';
import {
  BARE_PLUGIN_ENTRY,
  CANARY_TAG,
  fileConfigEntry,
  isOpenCodeSddReference,
  npmConfigEntry,
  planPluginEntry,
  resolvePluginEntry,
  type PluginEntryResolution,
} from './plugin-entry.js';

describe('npmConfigEntry / fileConfigEntry', () => {
  it('formats an npm pin as name@spec', () => {
    expect(npmConfigEntry('canary')).toBe('opencode-sdd@canary');
    expect(npmConfigEntry('1.2.0')).toBe('opencode-sdd@1.2.0');
  });

  it('formats a local path as a file:// URL (absolute, URL-encoded)', () => {
    expect(fileConfigEntry('/repo/opencode-sdd')).toBe('file:///repo/opencode-sdd');
    // Relative paths are resolved against the process cwd.
    const resolved = fileConfigEntry('some/path');
    expect(resolved.startsWith('file://')).toBe(true);
    expect(resolved.endsWith('/some/path')).toBe(true);
    // Spaces are URL-encoded like the e2e harness's pathToFileURL.
    expect(fileConfigEntry('/repo/with space')).toBe('file:///repo/with%20space');
  });
});

describe('isOpenCodeSddReference', () => {
  it('recognizes the bare name and npm name@spec pins', () => {
    expect(isOpenCodeSddReference('opencode-sdd')).toBe(true);
    expect(isOpenCodeSddReference('opencode-sdd@canary')).toBe(true);
    expect(isOpenCodeSddReference('opencode-sdd@1.2.0')).toBe(true);
  });

  it('recognizes the hand-written (non-functional) npm: form so a broken entry is never duplicated', () => {
    expect(isOpenCodeSddReference('npm:opencode-sdd')).toBe(true);
    expect(isOpenCodeSddReference('npm:opencode-sdd@canary')).toBe(true);
  });

  it('does not match other plugins or unrelated strings', () => {
    expect(isOpenCodeSddReference('other-plugin')).toBe(false);
    expect(isOpenCodeSddReference('opencode-sddish')).toBe(false);
    expect(isOpenCodeSddReference('@scope/opencode-sdd')).toBe(false);
  });
});

describe('planPluginEntry', () => {
  it('noops on an exact match (any form)', () => {
    expect(planPluginEntry(['opencode-sdd'], 'opencode-sdd', false)).toBe('noop');
    expect(planPluginEntry(['opencode-sdd@canary'], 'opencode-sdd@canary', true)).toBe('noop');
    expect(planPluginEntry(['file:///repo/opencode-sdd'], 'file:///repo/opencode-sdd', true)).toBe(
      'noop',
    );
  });

  it('adds when no opencode-sdd reference exists', () => {
    expect(planPluginEntry(['other-plugin'], 'opencode-sdd', false)).toBe('add');
    expect(planPluginEntry([], 'opencode-sdd@canary', false)).toBe('add');
  });

  it('replaces with an explicit entry even when the existing reference is pinned', () => {
    expect(planPluginEntry(['opencode-sdd@canary'], 'opencode-sdd', true)).toBe('replace');
    expect(planPluginEntry(['opencode-sdd'], 'opencode-sdd@canary', true)).toBe('replace');
  });

  it('auto-upgrades a bare reference to the pin', () => {
    expect(planPluginEntry(['opencode-sdd'], 'opencode-sdd@canary', false)).toBe('replace');
  });

  it('keeps a pinned reference unchanged under the automatic default (no silent downgrade)', () => {
    expect(planPluginEntry(['opencode-sdd@canary'], 'opencode-sdd', false)).toBe('keep-existing');
    expect(planPluginEntry(['opencode-sdd@1.2.0'], 'opencode-sdd', false)).toBe('keep-existing');
  });

  it('keeps existing when multiple opencode-sdd references are present (ambiguous)', () => {
    expect(
      planPluginEntry(['opencode-sdd', 'opencode-sdd@canary'], 'opencode-sdd@1.2.0', true),
    ).toBe('keep-existing');
  });
});

describe('resolvePluginEntry', () => {
  const release = { root: '/repo', version: '1.2.1', prerelease: false };
  const canary = { root: '/repo', version: '1.2.1-canary.abc123', prerelease: true };

  it('defaults to the bare entry for a release build', () => {
    expect(resolvePluginEntry({ cwd: '/cwd', own: release })).toEqual({
      entry: 'opencode-sdd',
      explicit: false,
    });
  });

  it('pins the canary dist-tag for a prerelease build', () => {
    expect(resolvePluginEntry({ cwd: '/cwd', own: canary })).toEqual({
      entry: 'opencode-sdd@canary',
      explicit: false,
    });
  });

  it('falls back to the bare entry when the running package is unknown', () => {
    expect(resolvePluginEntry({ cwd: '/cwd', own: null })).toEqual({
      entry: 'opencode-sdd',
      explicit: false,
    });
  });

  it('prefers an explicit --tag over the build-aware default', () => {
    expect(resolvePluginEntry({ cwd: '/cwd', own: canary, tag: 'latest' })).toEqual({
      entry: 'opencode-sdd@latest',
      explicit: true,
    });
    expect(resolvePluginEntry({ cwd: '/cwd', own: release, tag: '1.2.0' })).toEqual({
      entry: 'opencode-sdd@1.2.0',
      explicit: true,
    });
  });

  it('prefers --local (with an explicit path, resolved against cwd) over --tag', () => {
    const resolved = resolvePluginEntry({
      cwd: '/cwd',
      own: release,
      local: true,
      localPath: '../src',
    }) as PluginEntryResolution;
    expect(resolved.explicit).toBe(true);
    expect(resolved.entry).toBe(`${fileConfigEntry('/cwd/../src')}`);
  });

  it('defaults --local to the running package root when no path is given', () => {
    expect(resolvePluginEntry({ cwd: '/cwd', own: release, local: true })).toEqual({
      entry: 'file:///repo',
      explicit: true,
    });
  });

  it('throws on --local with no path and no resolvable own package', () => {
    expect(() => resolvePluginEntry({ cwd: '/cwd', own: null, local: true })).toThrow(
      /--local requires a path/,
    );
  });

  it('throws on --tag combined with --local', () => {
    expect(() =>
      resolvePluginEntry({ cwd: '/cwd', own: release, tag: 'canary', local: true }),
    ).toThrow(/cannot be combined/);
  });

  it('throws on an invalid --tag value', () => {
    expect(() => resolvePluginEntry({ cwd: '/cwd', own: release, tag: 'bad value' })).toThrow(
      /invalid --tag value/,
    );
    expect(() => resolvePluginEntry({ cwd: '/cwd', own: release, tag: 'a@b' })).toThrow(
      /invalid --tag value/,
    );
  });

  it('accepts --help short-circuit values unchanged (CANARY_TAG export)', () => {
    expect(CANARY_TAG).toBe('canary');
    expect(BARE_PLUGIN_ENTRY).toBe('opencode-sdd');
  });
});
