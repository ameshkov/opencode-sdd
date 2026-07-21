import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(dirname(here));
const script = join(repoRoot, 'scripts', 'check-runtime-imports.mjs');

const LEAK_LINE = `import { createOpencodeServer } from '@opencode-ai/sdk';\n`;

/** Run the build script against `buildDir` and return the full result. */
function run(buildDir: string) {
  return spawnSync('node', [script, buildDir], { encoding: 'utf8' });
}

describe('check-runtime-imports scoping', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sdd-cli-check-'));
    // Plugin entry graph leak (must be caught).
    mkdirSync(join(tmp, 'build'), { recursive: true });
    writeFileSync(join(tmp, 'build', 'index.js'), LEAK_LINE);
    // Top-level CLI leak (must be ignored — only build/index.js is gated).
    mkdirSync(join(tmp, 'build', 'cli'), { recursive: true });
    writeFileSync(join(tmp, 'build', 'cli', 'install.js'), LEAK_LINE);
    // 5-AFK: the probe module also imports @opencode-ai/sdk at runtime
    // (build/cli/model-probe.js). The directory-level skip covers it.
    writeFileSync(join(tmp, 'build', 'cli', 'model-probe.js'), LEAK_LINE);
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('ignores a leak under build/cli/ but flags one in build/index.js', () => {
    // The modified script writes the offender report to stderr and calls
    // `process.exit(1)` on a leak. `execFileSync` would THROW on the
    // non-zero exit and never return, so the assertions ride on
    // `spawnSync`'s `status`/`stderr` fields (which do not throw).
    const result = run(join(tmp, 'build'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('check-runtime-imports: leaked');
    expect(result.stderr).toContain('build/index.js');
    expect(result.stderr).not.toContain('build/cli/install.js');
    expect(result.stderr).not.toContain('build/cli/model-probe.js');
  });

  it('passes when only the top-level cli/ leaks', () => {
    const clean = mkdtempSync(join(tmpdir(), 'sdd-cli-check-ok-'));
    try {
      mkdirSync(join(clean, 'build', 'cli'), { recursive: true });
      writeFileSync(join(clean, 'build', 'cli', 'install.js'), LEAK_LINE);
      writeFileSync(join(clean, 'build', 'cli', 'model-probe.js'), LEAK_LINE);
      writeFileSync(join(clean, 'build', 'index.js'), `export const x = 1;\n`);
      const out = run(join(clean, 'build'));
      expect(out.status).toBe(0);
      expect(out.stdout).toContain('no @opencode-ai runtime imports');
    } finally {
      rmSync(clean, { recursive: true, force: true });
    }
  });

  it('still catches a leak in a nested cli/ directory (skip is top-level only)', () => {
    const nested = mkdtempSync(join(tmpdir(), 'sdd-cli-check-nested-'));
    try {
      mkdirSync(join(nested, 'build', 'commands', 'cli'), {
        recursive: true,
      });
      writeFileSync(join(nested, 'build', 'commands', 'cli', 'install.js'), LEAK_LINE);
      writeFileSync(join(nested, 'build', 'index.js'), `export const x = 1;\n`);
      const result = run(join(nested, 'build'));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('leaked');
      expect(result.stderr).toContain('build/commands/cli/install.js');
    } finally {
      rmSync(nested, { recursive: true, force: true });
    }
  });
});
