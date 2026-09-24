import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inlineAssetReferences } from './template-inliner.js';

describe('inlineAssetReferences', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'inliner-'));
    await mkdir(join(dir, 'sdd-spec'), { recursive: true });
    await writeFile(join(dir, 'sdd-spec', 'plan-template.md'), '# Template\n\nBody.\n');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('replaces a token with the referenced file content', async () => {
    const result = await inlineAssetReferences(
      'Before\n@opencode-sdd-templates/sdd-spec/plan-template.md\nAfter',
      dir,
    );

    expect(result.missing).toEqual([]);
    expect(result.text).toContain('Before\n# Template\n\nBody.\nAfter');
    expect(result.text).not.toContain('opencode-sdd-templates');
  });

  it('inlines every occurrence of the same token', async () => {
    const token = '@opencode-sdd-templates/sdd-spec/plan-template.md';
    const result = await inlineAssetReferences(`${token}\n${token}`, dir);

    expect(result.text.match(/# Template/g)).toHaveLength(2);
  });

  it('falls back to the absolute mention and reports a missing reference', async () => {
    const result = await inlineAssetReferences('@opencode-sdd-templates/sdd-spec/missing.md', dir);

    expect(result.missing).toEqual(['sdd-spec/missing.md']);
    expect(result.text).toBe(`@${dir}/sdd-spec/missing.md`);
  });

  it('leaves templates without tokens unchanged', async () => {
    const result = await inlineAssetReferences('plain body $ARGUMENTS', dir);

    expect(result.text).toBe('plain body $ARGUMENTS');
    expect(result.missing).toEqual([]);
  });
});
