import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCommandSource } from './source-loader.js';

describe('loadCommandSource', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sdd-src-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns the body (frontmatter stripped) and absolute path on success', async () => {
    await writeFile(
      join(dir, 'prd-validate.md'),
      ['---', 'description: validate', '---', '', 'Run the cross-cut audit.', ''].join('\n'),
    );

    const result = await loadCommandSource('prd-validate', dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBe('Run the cross-cut audit.\n');
      expect(result.absPath).toBe(join(dir, 'prd-validate.md'));
    }
  });

  it('returns a missing reason when the file does not exist', async () => {
    const result = await loadCommandSource('prd-validate', dir);

    expect(result).toEqual({ ok: false, reason: 'missing' });
  });

  it('returns an unreadable reason when the path is a directory', async () => {
    await mkdir(join(dir, 'prd-validate.md'));

    const result = await loadCommandSource('prd-validate', dir);

    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('returns an unreadable reason when the frontmatter fence is unclosed', async () => {
    await writeFile(
      join(dir, 'prd-validate.md'),
      '---\ndescription: broken\nbody without closing fence',
    );

    const result = await loadCommandSource('prd-validate', dir);

    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('returns the body unchanged when there is no frontmatter', async () => {
    await writeFile(join(dir, 'prd-validate.md'), 'No frontmatter at all.\n');

    const result = await loadCommandSource('prd-validate', dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBe('No frontmatter at all.\n');
    }
  });
});
