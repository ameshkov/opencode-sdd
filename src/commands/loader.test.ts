import { describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommands } from './loader.js';
import { stubClient } from '../../test/stub-client.js';
import { createLogger } from '../utils/index.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test',
  '__fixtures__',
);

describe('loadCommands', () => {
  it('parses every fixture into the expected command and skips malformed (AC9)', async () => {
    const logger = createLogger(stubClient());
    const result = await loadCommands(fixturesDir, logger);

    expect(result.has('malformed')).toBe(false);

    const valid = result.get('valid');
    expect(valid).toEqual({
      description: 'Valid command',
      agent: 'researcher',
      subtask: true,
      template: 'Valid body $ARGUMENTS\n',
    });

    const optional = result.get('optional');
    expect(optional).toEqual({
      description: 'Optional only',
      template: 'Optional body\n',
    });

    const multiLine = result.get('multi-line');
    expect(multiLine?.description).toBe('Multi-line\ndescription\n');
    expect(multiLine?.template).toBe('Multi-line body\n');
  });

  it('returns an empty map for a missing directory', async () => {
    const logger = createLogger(stubClient());
    const result = await loadCommands(join(tmpdir(), 'does-not-exist'), logger);
    expect(result.size).toBe(0);
  });

  it('produces a deterministic order', async () => {
    const dir = join(tmpdir(), 'loader-' + Math.random().toString(36).slice(2));
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'zebra.md'), '---\ndescription: z\n---\n\nz\n');
      await writeFile(join(dir, 'apple.md'), '---\ndescription: a\n---\n\na\n');
      const logger = createLogger(stubClient());
      const result = await loadCommands(dir, logger);
      expect([...result.keys()]).toEqual(['apple', 'zebra']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skips a malformed file in a real directory without throwing', async () => {
    const dir = join(tmpdir(), 'loader-' + Math.random().toString(36).slice(2));
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'alpha.md'), '---\ndescription: Alpha\n---\n\nAlpha body\n');
      await writeFile(join(dir, 'beta.md'), '---\nagent: x\n---\n\nBeta body\n');
      const logger = createLogger(stubClient());
      const result = await loadCommands(dir, logger);

      expect(result.get('alpha')).toEqual({
        description: 'Alpha',
        template: 'Alpha body\n',
      });
      expect(result.has('beta')).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
