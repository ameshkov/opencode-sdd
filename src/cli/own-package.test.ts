import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readOwnPackage } from './own-package.js';

describe('readOwnPackage', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-own-package-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('locates the running opencode-sdd package by walking up to its package.json', () => {
    // Start at this module's own URL (compiled to build/cli/own-package.js
    // in production); the walk must land on the repo's package.json.
    const own = readOwnPackage(import.meta.url);
    expect(own).not.toBeNull();
    // src/cli/<file>.ts -> walk up 2 levels -> repo root.
    expect(own!.root).toBe(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
    expect(own!.version).toMatch(/^\d+\.\d+\.\d+/);
    // The repo's own version decides the prerelease flag — mirror the
    // marker logic (a `-` suffix means prerelease, e.g. 1.2.1-canary.<sha>).
    expect(own!.prerelease).toBe(own!.version.includes('-'));
  });

  it('returns null outside any opencode-sdd package', () => {
    // A temp dir with no package.json, far from the repo.
    expect(readOwnPackage(pathToFileURL(dir).href)).toBeNull();
  });
});
