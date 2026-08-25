import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(dirname(here));
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  bin?: Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('package.json CLI wiring', () => {
  it('maps the opencode-sdd bin to build/cli/install.js', () => {
    expect(manifest.bin?.['opencode-sdd']).toBe('build/cli/install.js');
  });

  it('keeps files unchanged at ["build"]', () => {
    expect(manifest.files).toEqual(['build']);
  });

  it('pins jsonc-parser as a CLI runtime dependency', () => {
    expect(manifest.dependencies?.['jsonc-parser']).toBe('3.3.1');
  });

  it('keeps @inquirer/prompts pinned at 8.5.2', () => {
    expect(manifest.dependencies?.['@inquirer/prompts']).toBe('8.5.2');
  });

  it('pins diff as a CLI runtime dependency', () => {
    expect(manifest.dependencies?.['diff']).toBe('9.0.0');
  });

  it('pins @opencode-ai/sdk as a CLI runtime dependency', () => {
    // The SDK is imported at RUNTIME by src/cli/model-probe.ts
    // (createOpencodeServer + createOpencodeClient value imports), so it
    // moves from devDependencies to dependencies. Pinned at the same
    // version as the prior devDependency so the CLI's runtime, the CLI's
    // type surface, and the plugin entry's type surface never skew.
    expect(manifest.dependencies?.['@opencode-ai/sdk']).toBe('1.18.23');
  });

  it('removes @opencode-ai/sdk from devDependencies (no duplicate)', () => {
    // The SDK moves to dependencies — it must not ALSO remain in
    // devDependencies (a duplicate would be ambiguous and could skew).
    expect(manifest.devDependencies?.['@opencode-ai/sdk']).toBeUndefined();
  });

  it('does not add cross-spawn as a dependency', () => {
    // CLI runtime deps cap: @inquirer/prompts, jsonc-parser,
    // @opencode-ai/sdk, diff. cross-spawn is NOT among them — the SDK's
    // createOpencodeServer handles the spawn via its own transitive
    // cross-spawn dependency, not a direct dep of opencode-sdd.
    expect(manifest.dependencies?.['cross-spawn']).toBeUndefined();
  });
});
