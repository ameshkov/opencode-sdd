import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from './install.js';
import type { Candidate } from './config-resolver.js';
import type { DetectResult } from './prerequisites.js';

const ok = (): DetectResult => ({ ok: true, version: '1.18.27' });
const missing = (): DetectResult => ({ ok: false });

// A minimal valid JSON config written to the resolved target's path
// before each affected resolver test, so `main`'s `readFileSync` +
// `computePatch` succeed and the patcher dispatch can write the target.
const EMPTY_CONFIG = `{ "$schema": "https://opencode.ai/config.json" }`;

// `projectPath`/`globPath` are per-dir functions pointing at real tmp
// files. Distinct filenames keep the project-vs-global distinction (the
// resolver's `pickDefault` picks the project candidate; tests 3 and 4
// enumerate both and assert the default).
const projectPath = (dir: string): Candidate => ({
  source: 'project' as const,
  path: join(dir, 'project-opencode.json'),
});
const globPath = (dir: string): Candidate => ({
  source: 'global' as const,
  path: join(dir, 'global-opencode.json'),
});

describe('main (argument + prerequisites)', () => {
  it('exits 0 on --help', async () => {
    expect(await main(['--help'])).toBe(0);
  });

  it('exits 0 on install --help', async () => {
    expect(await main(['install', '--help'])).toBe(0);
  });

  it('exits 1 on an unknown flag', async () => {
    expect(await main(['install', '--bogus'])).toBe(1);
  });

  it('exits 1 on a missing subcommand', async () => {
    expect(await main([])).toBe(1);
  });

  it('exits 1 on an unknown subcommand', async () => {
    expect(await main(['fake'])).toBe(1);
  });

  it('exits 1 when opencode is missing', async () => {
    expect(await main(['install'], { detect: missing })).toBe(1);
  });
});

describe('main (config resolver integration)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-install-resolver-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 and prints the project path after interactive selection', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const project = projectPath(dir);
    const glob = globPath(dir);
    // Write a real config to the resolved target's path so the patcher
    // dispatch's readFileSync succeeds (otherwise ENOENT -> exit 1).
    writeFileSync(project.path, EMPTY_CONFIG);
    const promptTarget = vi.fn().mockResolvedValue(project);
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [project, glob],
      promptTarget,
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });
    expect(exit).toBe(0);
    expect(promptTarget).toHaveBeenCalledTimes(1);
    expect(promptTarget).toHaveBeenCalledWith([project, glob]);
    expect(log).toHaveBeenCalledWith(project.path);
    log.mockRestore();
    error.mockRestore();
  });

  it('exits 0 and uses the global default when only global is discovered', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const glob = globPath(dir);
    writeFileSync(glob.path, EMPTY_CONFIG);
    const promptTarget = vi.fn().mockResolvedValue(glob);
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [glob],
      promptTarget,
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });
    expect(exit).toBe(0);
    expect(promptTarget).toHaveBeenCalledWith([glob]);
    expect(log).toHaveBeenCalledWith(glob.path);
    log.mockRestore();
    error.mockRestore();
  });

  it('skips the prompt under --yes, prints the default path', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const project = projectPath(dir);
    const glob = globPath(dir);
    // pickDefault -> project; the resolved target's file must exist.
    writeFileSync(project.path, EMPTY_CONFIG);
    const promptTarget = vi.fn();
    const exit = await main(['install', '--yes'], {
      detect: ok,
      enumerateCandidates: () => [project, glob],
      promptTarget,
      selectYesModels: vi.fn().mockResolvedValue({ selection: {}, warnings: [], degraded: false }),
    });
    expect(exit).toBe(0);
    expect(promptTarget).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(project.path); // pickDefault -> project
    log.mockRestore();
    error.mockRestore();
  });

  it('reports "no target selected" and exits 0 when the create-new prompt is declined (interactive + empty candidates)', async () => {
    // Interactive + empty candidates now OFFERS create-new (the
    // synthetic candidate is passed to promptTarget). Decline (or
    // Ctrl-C at the create-new prompt) -> promptTarget returns null
    // -> "no target selected" + exit 0.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const promptTarget = vi.fn().mockResolvedValue(null); // decline create-new
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [],
      promptTarget,
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
    });
    expect(exit).toBe(0);
    expect(promptTarget).toHaveBeenCalledTimes(1);
    expect(promptTarget).toHaveBeenCalledWith([expect.objectContaining({ source: 'create' })]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no target selected'));
    error.mockRestore();
  });

  it('exits 0 when the user cancels at the prompt (Ctrl-C -> null mapping)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [projectPath(dir)],
      promptTarget: vi.fn().mockResolvedValue(null),
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
    });
    expect(exit).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no target selected'));
    error.mockRestore();
  });

  it('exits 1 with a message when the prompt throws an unexpected error (top-level guard)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [projectPath(dir)],
      promptTarget: vi.fn().mockRejectedValue(new Error('broken TTY')),
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
    });
    expect(exit).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('broken TTY'));
    expect(log).not.toHaveBeenCalledWith(projectPath(dir).path);
    log.mockRestore();
    error.mockRestore();
  });

  it('accepts -y as an alias for --yes on the resolver path', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const glob = globPath(dir);
    // pickDefault → glob (only enumerated candidate); file must exist.
    writeFileSync(glob.path, EMPTY_CONFIG);
    const promptTarget = vi.fn();
    const exit = await main(['install', '-y'], {
      detect: ok,
      enumerateCandidates: () => [glob],
      promptTarget,
      selectYesModels: vi.fn().mockResolvedValue({ selection: {}, warnings: [], degraded: false }),
    });
    expect(exit).toBe(0);
    expect(promptTarget).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(glob.path);
    log.mockRestore();
    error.mockRestore();
  });
});

describe('main (config patcher integration)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-install-patcher-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('patches the plugin entry into the resolved target', async () => {
    const target = join(dir, 'plain.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue({ selection: {}, warnings: [], degraded: false }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });

    expect(exit).toBe(0);
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      $schema: string;
      plugin: string[];
    };
    expect(onDisk.$schema).toBe('x'); // existing top-level key preserved
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(log).toHaveBeenCalledWith(target);
    // The unified diff is printed before the write (the diff
    // preview/summary) — contains the hunk marker and the changed line.
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@'));
    // The added `opencode-sdd` line appears as `+    "opencode-sdd"` (4-
    // space indentation preserved after the `+` marker — there is no
    // contiguous `+"opencode-sdd"` substring in the actual diff output).
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\+.*"opencode-sdd"/m));
    log.mockRestore();
    error.mockRestore();
  });

  it('reports "no changes" and writes nothing when the plugin entry is already present', async () => {
    const target = join(dir, 'idempotent.json');
    const original = `{
  "plugin": ["opencode-sdd"]
}`;
    writeFileSync(target, original);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [projectPath(dir)],
      promptTarget: vi.fn().mockResolvedValue({
        source: 'project',
        path: target,
      } as Candidate),
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });

    expect(exit).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(original); // byte-identical
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no changes'));
    // A no-op prints "no changes", not the diff. The diff field itself
    // is '' (verified in config-patcher.test.ts); here the print site
    // must not emit a diff string at all.
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('@@'));
    log.mockRestore();
    error.mockRestore();
  });

  it('preserves comments and key order when patching a .jsonc', async () => {
    const target = join(dir, 'commented.jsonc');
    const commented = `{
  // a header comment
  "$schema": "x",
  "model": "anthropic/claude"
}`;
    writeFileSync(target, commented);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({
        source: 'project',
        path: target,
      } as Candidate),
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });

    expect(exit).toBe(0);
    const onDisk = readFileSync(target, 'utf8');
    expect(onDisk).toContain('// a header comment');
    expect(onDisk).toContain('"$schema"');
    expect(onDisk).toContain('"model"');
    expect(onDisk).toContain('"opencode-sdd"');
    log.mockRestore();
    error.mockRestore();
  });

  it('exits 1 with a write-error message and leaves the original intact when the write fails', async () => {
    const target = join(dir, 'readonly.json');
    writeFileSync(target, `{}`);
    const original = readFileSync(target, 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      writeTarget: () => {
        throw new Error("EACCES: permission denied, open 'readonly.json'");
      },
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue({ selection: {}, warnings: [], degraded: false }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });
    expect(exit).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('install:'));
    expect(readFileSync(target, 'utf8')).toBe(original);
    log.mockRestore();
    error.mockRestore();
  });

  it('exits 1 with a malformed-JSONC message when the target file is unparseable', async () => {
    const target = join(dir, 'malformed.jsonc');
    writeFileSync(target, `{ "plugin": [ }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({
        source: 'project',
        path: target,
      } as Candidate),
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [],
        degraded: false,
      }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });

    expect(exit).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('malformed JSONC'));
    log.mockRestore();
    error.mockRestore();
  });

  it('prints the unified diff before the write under --yes (applied-changes summary)', async () => {
    const target = join(dir, 'yes-diff.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install', '--yes'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      // pickDefault -> the only candidate; no prompt under --yes.
      promptTarget: vi.fn(),
      selectYesModels: vi.fn().mockResolvedValue({ selection: {}, warnings: [], degraded: false }),
    });

    expect(exit).toBe(0);
    // The resolved path is printed.
    expect(log).toHaveBeenCalledWith(target);
    // The unified diff is printed before the write-through (the
    // applied-changes summary under --yes).
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@'));
    // The added `opencode-sdd` line appears as `+    "opencode-sdd"`
    // (indentation preserved — no contiguous `+"opencode-sdd"` substring).
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\+.*"opencode-sdd"/m));
    // The file was written (proof the diff print precedes but does
    // not block the write under --yes — no confirmation gate).
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    log.mockRestore();
    error.mockRestore();
  });
});

describe('main (plugin entry resolution)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-install-entry-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const releaseOwn = { root: '/tmp/opencode-sdd', version: '1.2.1', prerelease: false };
  const canaryOwn = { root: '/tmp/opencode-sdd', version: '1.2.1-canary.abc123', prerelease: true };

  /** Minimal deps for a patch-through run against `target`. */
  function patchDeps(target: string, extra: object = {}) {
    return {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue({ selection: {}, warnings: [], degraded: false }),
      confirmPatch: vi.fn().mockResolvedValue(true),
      ...extra,
    };
  }

  it('writes an npm pin and prints the entry when --tag is given', async () => {
    const target = join(dir, 'tag.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install', '--tag', 'canary'], patchDeps(target));

    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith('plugin entry: opencode-sdd@canary');
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd@canary']);
    log.mockRestore();
    error.mockRestore();
  });

  it('self-pins the canary dist-tag when the running build is a prerelease', async () => {
    const target = join(dir, 'canary-self.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install'], patchDeps(target, { readOwnPackage: () => canaryOwn }));

    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith('plugin entry: opencode-sdd@canary');
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd@canary']);
    log.mockRestore();
    error.mockRestore();
  });

  it('keeps the bare latest entry for a release build (default behaviour unchanged)', async () => {
    const target = join(dir, 'release-default.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install'], patchDeps(target, { readOwnPackage: () => releaseOwn }));

    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith('plugin entry: opencode-sdd');
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    log.mockRestore();
    error.mockRestore();
  });

  it('writes a file:// entry for --local (defaulting to the running package root)', async () => {
    const target = join(dir, 'local.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(
      ['install', '--local'],
      patchDeps(target, { readOwnPackage: () => releaseOwn }),
    );

    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith('plugin entry: file:///tmp/opencode-sdd');
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
    };
    expect(onDisk.plugin).toEqual(['file:///tmp/opencode-sdd']);
    log.mockRestore();
    error.mockRestore();
  });

  it('keeps a pinned reference and warns instead of silently downgrading it', async () => {
    const target = join(dir, 'keep-pin.json');
    const original = `{
  "plugin": ["opencode-sdd@canary"]
}`;
    writeFileSync(target, original);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exit = await main(['install'], patchDeps(target, { readOwnPackage: () => releaseOwn }));

    expect(exit).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(original); // untouched
    expect(error).toHaveBeenCalledWith(expect.stringContaining("'opencode-sdd@canary'"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no changes'));
    log.mockRestore();
    error.mockRestore();
  });

  it('exits 1 when --tag has an invalid value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install', '--tag', 'bad value'], {
      detect: ok,
      enumerateCandidates: () => [],
    });
    expect(exit).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('invalid --tag value'));
    error.mockRestore();
  });

  it('exits 1 when --local points at a missing path', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install', '--local', join(dir, 'does-not-exist')], {
      detect: ok,
      enumerateCandidates: () => [],
    });
    expect(exit).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    error.mockRestore();
  });
});
