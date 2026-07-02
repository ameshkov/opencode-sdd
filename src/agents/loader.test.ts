import { describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAgents } from './loader.js';
import { stubClient } from '../../test/stub-client.js';
import { createLogger } from '../utils/index.js';

const VALID = [
  '---',
  'description: Researcher',
  'mode: subagent',
  'hidden: true',
  '---',
  '',
  'prompt body',
  '',
].join('\n');

const MALFORMED = ['---', 'mode: subagent', '---', '', 'no description', ''].join('\n');

describe('loadAgents', () => {
  it('returns an empty map for a missing directory', async () => {
    const logger = createLogger(stubClient());
    const result = await loadAgents(join(tmpdir(), 'no-such-agents-dir'), logger);
    expect(result.size).toBe(0);
  });

  it('parses valid agents and skips malformed ones without throwing', async () => {
    const dir = join(tmpdir(), 'agents-' + Math.random().toString(36).slice(2));
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'sdd-explore.md'), VALID);
      await writeFile(join(dir, 'broken.md'), MALFORMED);
      const logger = createLogger(stubClient());
      const result = await loadAgents(dir, logger);

      expect([...result.keys()]).toEqual(['sdd-explore']);
      const explore = result.get('sdd-explore');
      expect(explore?.mode).toBe('subagent');
      expect(explore?.['hidden']).toBe(true);
      expect(explore?.prompt).toBe('prompt body\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('produces a deterministic (lexicographic) order', async () => {
    const dir = join(tmpdir(), 'agents-' + Math.random().toString(36).slice(2));
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'zebra.md'), VALID);
      await writeFile(join(dir, 'apple.md'), VALID);
      const logger = createLogger(stubClient());
      const result = await loadAgents(dir, logger);
      expect([...result.keys()]).toEqual(['apple', 'zebra']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
