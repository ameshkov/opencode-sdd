import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findConfigInDir,
  findRepoRoot,
  resolveGlobalConfigBase,
  type ResolveGlobalDirEnv,
} from './config-paths.js';

describe('resolveGlobalConfigBase', () => {
  it('uses XDG_CONFIG_HOME when set on non-Windows', () => {
    const dir = resolveGlobalConfigBase({
      platform: 'darwin',
      homedir: '/Users/test',
      env: { XDG_CONFIG_HOME: '/custom/xdg' },
    });
    expect(dir).toBe(join('/custom/xdg', 'opencode'));
  });

  it('falls back to ~/.config on non-Windows without XDG', () => {
    const dir = resolveGlobalConfigBase({
      platform: 'linux',
      homedir: '/home/test',
      env: {},
    });
    expect(dir).toBe(join('/home/test', '.config', 'opencode'));
  });

  it('uses APPDATA on Windows when set', () => {
    const dir = resolveGlobalConfigBase({
      platform: 'win32',
      homedir: 'C:\\Users\\test',
      env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
    });
    expect(dir).toBe(join('C:\\Users\\test\\AppData\\Roaming', 'opencode'));
  });

  it('derives APPDATA from homedir on Windows when unset', () => {
    const dir = resolveGlobalConfigBase({
      platform: 'win32',
      homedir: 'C:\\Users\\test',
      env: {},
    });
    expect(dir).toBe(join('C:\\Users\\test', 'AppData', 'Roaming', 'opencode'));
  });
});

describe('findRepoRoot', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sdd-paths-'));
    mkdirSync(join(tmp, '.git'), { recursive: true });
    mkdirSync(join(tmp, 'sub', 'deep'), { recursive: true });
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('walks up to the .git-bearing root', () => {
    expect(findRepoRoot(join(tmp, 'sub', 'deep'))).toBe(tmp);
  });

  it('returns cwd when cwd itself contains .git', () => {
    expect(findRepoRoot(tmp)).toBe(tmp);
  });

  it('returns null when no .git is found up to the filesystem root', () => {
    const bare = mkdtempSync(join(tmpdir(), 'sdd-paths-bare-'));
    try {
      expect(findRepoRoot(bare)).toBeNull();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('findConfigInDir', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sdd-paths-cfg-'));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns the .json path when present', () => {
    const dir = join(tmp, 'has-json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'opencode.json'), '{}');
    expect(findConfigInDir(dir)).toBe(join(dir, 'opencode.json'));
  });

  it('falls back to .jsonc when .json is absent', () => {
    const dir = join(tmp, 'has-jsonc');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'opencode.jsonc'), '{}');
    expect(findConfigInDir(dir)).toBe(join(dir, 'opencode.jsonc'));
  });

  it('prefers .json over .jsonc when both exist', () => {
    const dir = join(tmp, 'has-both');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'opencode.json'), '{}');
    writeFileSync(join(dir, 'opencode.jsonc'), '{}');
    expect(findConfigInDir(dir)).toBe(join(dir, 'opencode.json'));
  });

  it('returns null when neither file exists', () => {
    const dir = join(tmp, 'empty');
    mkdirSync(dir, { recursive: true });
    expect(findConfigInDir(dir)).toBeNull();
  });

  it('ignores other filenames (e.g. opencode.txt)', () => {
    const dir = join(tmp, 'wrong-name');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'opencode.txt'), 'not a config');
    expect(findConfigInDir(dir)).toBeNull();
  });

  it('returns null when the directory does not exist', () => {
    expect(findConfigInDir(join(tmp, 'no-such-dir'))).toBeNull();
  });
});

// Type-level smoke: ResolveGlobalDirEnv is exported as a type so the
// resolver module can extend it. The local proves the export is visible.
describe('ResolveGlobalDirEnv export', () => {
  it('is a visible type usable from outside the module', () => {
    const env: ResolveGlobalDirEnv = {
      platform: 'darwin',
      homedir: '/x',
      env: {},
    };
    expect(env.platform).toBe('darwin');
  });
});
