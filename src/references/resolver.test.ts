import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveTemplatesReference, TEMPLATES_REFERENCE_ALIAS } from './resolver.js';
import { stubClient } from '../../test/stub-client.js';
import { createLogger } from '../utils/index.js';

describe('TEMPLATES_REFERENCE_ALIAS', () => {
  it('is the documented alias with no forbidden characters', () => {
    expect(TEMPLATES_REFERENCE_ALIAS).toBe('opencode-sdd-templates');
    // No slash, whitespace, backtick, or comma.
    expect(TEMPLATES_REFERENCE_ALIAS).not.toMatch(/[/\s`,]/);
  });
});

describe('resolveTemplatesReference', () => {
  it('returns an entry pointing at the assets dir with hidden:true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'assets-'));
    try {
      await mkdir(join(dir, 'prd-write'), { recursive: true });
      await writeFile(join(dir, 'prd-write', 'prd-template.md'), 'x\n');
      const client = stubClient();
      const logger = createLogger(client);

      const entry = await resolveTemplatesReference(dir, logger);

      expect(entry).toEqual({
        path: dir,
        description: 'opencode-sdd bundled prompt template assets',
        hidden: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined and warns when the directory is missing', async () => {
    const client = stubClient();
    const logger = createLogger(client);

    const entry = await resolveTemplatesReference(join(tmpdir(), 'no-such-assets'), logger);

    expect(entry).toBeUndefined();
    const warned = vi
      .mocked(client.app.log)
      .mock.calls.some((call) => call[0]?.body?.level === 'warn');
    expect(warned).toBe(true);
  });

  it('returns undefined and warns when the path is not a directory', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'assets-')), 'i-am-a-file');
    try {
      await writeFile(file, 'x\n');
      const client = stubClient();
      const logger = createLogger(client);

      const entry = await resolveTemplatesReference(file, logger);

      expect(entry).toBeUndefined();
      const warned = vi
        .mocked(client.app.log)
        .mock.calls.some((call) => call[0]?.body?.level === 'warn');
      expect(warned).toBe(true);
    } finally {
      await rm(file, { recursive: true, force: true });
    }
  });
});
