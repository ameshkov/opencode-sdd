import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  enumerateCandidates,
  pickDefault,
  type Candidate,
  type ResolverEnv,
} from './config-resolver.js';

/** Build a ResolverEnv whose global resolution points at an empty homedir. */
function envFor(cwd: string, env: Record<string, string | undefined> = {}): ResolverEnv {
  return { cwd, env, homedir: '/nonexistent', platform: 'darwin' };
}

describe('enumerateCandidates', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sdd-resolver-'));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('discovers a project config by walking up to the nearest repo root', () => {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, 'opencode.json'), '{}');
    mkdirSync(join(repo, 'sub', 'deep'), { recursive: true });

    const candidates = enumerateCandidates(envFor(join(repo, 'sub', 'deep')));
    expect(candidates).toEqual([{ source: 'project', path: join(repo, 'opencode.json') }]);
  });

  it('prefers opencode.json over opencode.jsonc at the repo root', () => {
    const repo = join(tmp, 'repo-jsonc');
    mkdirSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, 'opencode.json'), '{}');
    writeFileSync(join(repo, 'opencode.jsonc'), '{}');

    const candidates = enumerateCandidates(envFor(repo));
    expect(candidates[0]?.source).toBe('project');
    expect(candidates[0]?.path).toBe(join(repo, 'opencode.json'));
  });

  it('discovers a global candidate when no project exists', () => {
    const xdgRoot = join(tmp, 'xdg-only');
    const globalDir = join(xdgRoot, 'opencode');
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, 'opencode.jsonc'), '{}');

    const bareCwd = join(tmp, 'bare-cwd-global');
    mkdirSync(bareCwd, { recursive: true });

    const env: ResolverEnv = {
      cwd: bareCwd,
      env: { XDG_CONFIG_HOME: xdgRoot },
      homedir: '/nonexistent',
      platform: 'darwin',
    };
    const candidates = enumerateCandidates(env);
    expect(candidates).toEqual([{ source: 'global', path: join(globalDir, 'opencode.jsonc') }]);
  });

  it('includes the OPENCODE_CONFIG path among candidates when it exists', () => {
    const envFile = join(tmp, 'env-config.json');
    writeFileSync(envFile, '{}');

    const candidates = enumerateCandidates({
      cwd: tmp,
      env: { OPENCODE_CONFIG: envFile },
      homedir: '/nonexistent',
      platform: 'darwin',
    });
    const envCandidate = candidates.find((c) => c.source === 'env');
    expect(envCandidate).toBeDefined();
    expect(envCandidate?.path).toBe(envFile);
  });

  it('skips OPENCODE_CONFIG when the pointed file does not exist', () => {
    const candidates = enumerateCandidates({
      cwd: tmp,
      env: { OPENCODE_CONFIG: join(tmp, 'no-such-file.json') },
      homedir: '/nonexistent',
      platform: 'darwin',
    });
    expect(candidates.find((c) => c.source === 'env')).toBeUndefined();
  });

  it('dedupes when OPENCODE_CONFIG collides with the project path', () => {
    const repo = join(tmp, 'dedupe-repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, 'opencode.json'), '{}');

    const candidates = enumerateCandidates({
      cwd: repo,
      env: { OPENCODE_CONFIG: join(repo, 'opencode.json') },
      homedir: '/nonexistent',
      platform: 'darwin',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source).toBe('project');
    expect(candidates[0]?.path).toBe(join(repo, 'opencode.json'));
  });

  it('returns candidates in project -> env -> global order', () => {
    const repo = join(tmp, 'ordered-repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    writeFileSync(join(repo, 'opencode.json'), '{}');

    const envFile = join(tmp, 'ordered-env.json');
    writeFileSync(envFile, '{}');

    const xdgRoot = join(tmp, 'ordered-xdg');
    const globalDir = join(xdgRoot, 'opencode');
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, 'opencode.json'), '{}');

    const candidates = enumerateCandidates({
      cwd: repo,
      env: {
        OPENCODE_CONFIG: envFile,
        XDG_CONFIG_HOME: xdgRoot,
      },
      homedir: '/nonexistent',
      platform: 'darwin',
    });
    expect(candidates.map((c) => c.source)).toEqual(['project', 'env', 'global']);
  });

  it('returns an empty list when no candidates are discoverable', () => {
    const bareCwd = join(tmp, 'bare-cwd-empty');
    mkdirSync(bareCwd, { recursive: true });
    expect(enumerateCandidates(envFor(bareCwd))).toEqual([]);
  });

  it('resolves OPENCODE_CONFIG relative to cwd when not absolute', () => {
    const subdir = join(tmp, 'env-rel-subdir');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'rel.json'), '{}');

    const candidates = enumerateCandidates({
      cwd: subdir,
      env: { OPENCODE_CONFIG: 'rel.json' },
      homedir: '/nonexistent',
      platform: 'darwin',
    });
    expect(candidates.find((c) => c.source === 'env')?.path).toBe(join(subdir, 'rel.json'));
  });
});

describe('pickDefault', () => {
  const project: Candidate = { source: 'project', path: '/p/opencode.json' };
  const env: Candidate = { source: 'env', path: '/e/opencode.json' };
  const glob: Candidate = { source: 'global', path: '/g/opencode.json' };

  it('prefers project over global and env', () => {
    expect(pickDefault([glob, project, env])).toEqual(project);
  });

  it('falls back to global when no project is present', () => {
    expect(pickDefault([env, glob])).toEqual(glob);
  });

  it('falls back to env only when neither project nor global is present', () => {
    expect(pickDefault([env])).toEqual(env);
  });

  it('returns null for an empty list', () => {
    expect(pickDefault([])).toBeNull();
  });

  const create: Candidate = { source: 'create', path: '/c/opencode.json' };

  it('returns null when only a create-new candidate is present (create is never picked by pickDefault)', () => {
    // pickDefault is --yes-only; main short-circuits --yes + empty
    // candidates to exit 1 before pickOrPromptTarget is reached, so a
    // 'create' candidate never reaches pickDefault in production. This
    // test pins the safe fallback: pickDefault does NOT auto-pick a
    // synthetic create-new candidate under --yes — the --yes+no-config
    // case errors instead of silently creating.
    expect(pickDefault([create])).toBeNull();
  });
});
