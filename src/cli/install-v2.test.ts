/**
 * End-to-end wizard tests for the opencode V2 host line: version floor
 * enforcement, V2-native config shapes (`plugins`/`agents`), and the V2 local
 * plugin entry form.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from './install.js';
import type { Candidate } from './config-resolver.js';
import type { DetectResult } from './prerequisites.js';
import type { YesSelectionResult } from './yes-selection.js';

/** A parsed V2 detection result. */
const v2 = (): DetectResult => ({
  ok: true,
  raw: 'opencode v2.0.14',
  version: '2.0.14',
  major: 2,
  minor: 0,
  patch: 14,
});

/** A parsed V1 result below the supported floor. */
const oldV1 = (): DetectResult => ({
  ok: true,
  raw: '1.18.23',
  version: '1.18.23',
  major: 1,
  minor: 18,
  patch: 23,
});

/** A canned selection with one recommended model. */
function yesRecommended(agent: string, model: string): YesSelectionResult {
  return {
    selection: { models: new Map([[agent, model]]) },
    warnings: [],
    degraded: false,
  };
}

describe('main (opencode v2)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-install-v2-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes V2-native plugins/agents keys and model assignments', async () => {
    const target = join(dir, 'v2-recommended.json');
    writeFileSync(target, `{ "$schema": "https://opencode.ai/config.json" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const exit = await main(['install', '--yes'], {
        detect: v2,
        enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
        selectYesModels: vi
          .fn()
          .mockResolvedValue(yesRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      });

      expect(exit).toBe(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('v2 plugin API'));
      const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
        plugin?: unknown;
        plugins: string[];
        agent?: unknown;
        agents: { 'sdd-coder': { model: string } };
      };
      expect(onDisk.plugins).toEqual(['opencode-sdd']);
      expect(onDisk.plugin).toBeUndefined();
      expect(onDisk.agents['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
      expect(onDisk.agent).toBeUndefined();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('refuses opencode 1.x below the 1.18.29 floor and writes nothing', async () => {
    const target = join(dir, 'v2-old.json');
    writeFileSync(target, `{ "$schema": "https://opencode.ai/config.json" }`);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const selectYesModels = vi.fn();
    try {
      const exit = await main(['install', '--yes'], {
        detect: oldV1,
        enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
        selectYesModels,
      });

      expect(exit).toBe(1);
      expect(selectYesModels).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('1.18.23'));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('1.18.29'));
      expect(readFileSync(target, 'utf8')).toBe(`{ "$schema": "https://opencode.ai/config.json" }`);
    } finally {
      error.mockRestore();
    }
  });

  it('refuses an unparseable version with the raw output in the message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const exit = await main(['install'], {
        detect: () => ({ ok: false, reason: 'unparseable', raw: 'garbage' }),
      });

      expect(exit).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('garbage'));
    } finally {
      error.mockRestore();
    }
  });

  it('resolves --local to <root>/build on v2', async () => {
    const target = join(dir, 'v2-local.json');
    const localPkg = join(dir, 'local-pkg');
    mkdirSync(localPkg, { recursive: true });
    writeFileSync(target, `{ "$schema": "https://opencode.ai/config.json" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const exit = await main(['install', '--yes', '--local', localPkg], {
        detect: v2,
        enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
        selectYesModels: vi.fn().mockResolvedValue({ selection: {}, warnings: [], degraded: true }),
      });

      expect(exit).toBe(0);
      const onDisk = JSON.parse(readFileSync(target, 'utf8')) as { plugins: string[] };
      expect(onDisk.plugins).toEqual([`file://${localPkg}/build`]);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
