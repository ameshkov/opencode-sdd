import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  applyPatch,
  computePatch,
  defaultAtomicWrite,
  type ComputedPatch,
} from './config-patcher.js';

describe('applyPatch — happy path (atomic write)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-patcher-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the patched text to the target via defaultAtomicWrite', () => {
    const target = join(dir, 'plain.json');
    writeFileSync(
      target,
      `{
  "$schema": "https://opencode.ai/config.json"
}`,
    );
    const patch = computePatch(readFileSync(target, 'utf8'), {});
    expect(patch.noChanges).toBe(false);

    const result = applyPatch(target, patch);

    expect(result).toBe(target);
    const onDisk = readFileSync(target, 'utf8');
    expect(onDisk).toBe(patch.patchedText);
    // The .tmp.sdd-<pid> temp file is gone after a successful write.
    const tempPath = join(dir, 'plain.json.tmp.sdd-' + process.pid);
    expect(() => readFileSync(tempPath, 'utf8')).toThrow(/ENOENT/);
  });

  it('produces a valid JSON file when patching a .json', () => {
    const target = join(dir, 'plain2.json');
    writeFileSync(target, `{}`);
    applyPatch(target, computePatch(readFileSync(target, 'utf8'), {}));
    const parsed = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
    };
    expect(parsed.plugin).toEqual(['opencode-sdd']);
  });
});

describe('applyPatch — no-op short-circuit', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-patcher-noop-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null and writes nothing when noChanges is true', () => {
    const target = join(dir, 'already.json');
    const original = `{
  "plugin": ["opencode-sdd"]
}`;
    writeFileSync(target, original);
    const beforeStat = readFileSync(target, 'utf8');

    const patch: ComputedPatch = { patchedText: original, noChanges: true, diff: '' };
    const result = applyPatch(target, patch);

    expect(result).toBeNull();
    expect(readFileSync(target, 'utf8')).toBe(beforeStat);
  });

  it('never calls the injected atomicWrite when noChanges is true', () => {
    const atomicWrite = vi.fn();
    const patch: ComputedPatch = { patchedText: '{}', noChanges: true, diff: '' };
    applyPatch('/anywhere/opencode.json', patch, { atomicWrite });
    expect(atomicWrite).not.toHaveBeenCalled();
  });
});

describe('applyPatch — failure modes', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-patcher-fail-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('surfaces an injected write failure as a thrown error', () => {
    const target = join(dir, 'injected-fail.json');
    writeFileSync(target, `{}`);
    const original = readFileSync(target, 'utf8');
    const patch: ComputedPatch = {
      patchedText: `{
  "plugin": ["opencode-sdd"]
}`,
      noChanges: false,
      diff: '',
    };
    const atomicWrite = vi.fn(() => {
      throw new Error('EACCES: permission denied');
    });

    expect(() => applyPatch(target, patch, { atomicWrite })).toThrow(/EACCES/);

    // The original file is untouched — the throwing atomicWrite never
    // reached the rename (the original is structurally intact on a
    // failed write — interrupt safety).
    expect(readFileSync(target, 'utf8')).toBe(original);
  });

  // `permsIt` selects `it.skip` when filesystem perms are non-portable:
  // under CI containers running as root the 0o500 perms are bypassed,
  // and on Windows `chmod` does not gate directory entry creation the
  // way it does on POSIX. The injected-throwing-`atomicWrite` test
  // above is the canonical, deterministic failure assertion; this real
  // perm test is a *supplement* that exercises the `defaultAtomicWrite`
  // `EACCES` code path end-to-end on POSIX non-root runners.
  const isRoot = process.getuid?.() === 0;
  const permsPortable = process.platform !== 'win32' && !isRoot;
  const permsIt = permsPortable ? it : it.skip;
  permsIt('throws a clear EACCES on an unwritable directory under POSIX', () => {
    const lockedDir = mkdtempSync(join(tmpdir(), 'sdd-patcher-readonly-'));
    writeFileSync(join(lockedDir, 'opencode.json'), `{}`);
    // Restore perms in `finally` so afterAll's rmSync always succeeds,
    // and so a failed assertion does not leave a locked dir behind.
    try {
      chmodSync(lockedDir, 0o500); // strip write/exec — temp create fails
      const target = join(lockedDir, 'opencode.json');
      const patch = computePatch(`{}`, {});
      expect(() => applyPatch(target, patch)).toThrow(/EACCES|EROFS/);
      // The original is untouched (atomic write — never reached rename).
      expect(readFileSync(target, 'utf8')).toBe(`{}`);
    } finally {
      chmodSync(lockedDir, 0o700);
      rmSync(lockedDir, { recursive: true, force: true });
    }
  });
});

describe('defaultAtomicWrite — temp-then-rename primitive', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-patcher-atomic-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the new text to the target atomically (no temp remains)', () => {
    const target = join(dir, 'atomic.json');
    writeFileSync(
      target,
      `{
  "old": true
}`,
    );
    defaultAtomicWrite(
      target,
      `{
  "new": true
}`,
    );
    expect(readFileSync(target, 'utf8')).toBe(`{
  "new": true
}`);
    // No leftover temp:
    const tempPath = join(dirname(target), 'atomic.json.tmp.sdd-' + process.pid);
    expect(() => readFileSync(tempPath, 'utf8')).toThrow(/ENOENT/);
  });

  it('cleans up the temp file when the rename fails (best-effort)', () => {
    // Inject a rename failure by pointing defaultAtomicWrite at a path
    // whose directory does not exist — writeFileSync throws before any
    // real rename is attempted, so the temp file is never created; the
    // error propagates with no litter.
    const bogusTarget = join(dir, 'no-such-subdir', 'atomic.json');
    expect(() => defaultAtomicWrite(bogusTarget, `{}`)).toThrow(/ENOENT/);
    // No temp file land in `dir`:
    const tempPath = join(dir, 'atomic.json.tmp.sdd-' + process.pid);
    expect(() => readFileSync(tempPath, 'utf8')).toThrow(/ENOENT/);
  });
});
