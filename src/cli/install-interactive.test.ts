import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from './install.js';
import type { Candidate } from './config-resolver.js';
import type { DetectResult } from './prerequisites.js';
import type { InteractiveSelectionResult } from './interactive-selection.js';

const ok = (): DetectResult => ({ ok: true, version: '1.18.23' });

/** Build a canned InteractiveSelectionResult for a recommended-model selection. */
function interactiveRecommended(agent: string, model: string): InteractiveSelectionResult {
  return {
    selection: { models: new Map([[agent, model]]) },
    warnings: [],
    degraded: false,
  };
}

describe('main (interactive flow)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-install-interactive-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('interactive + confirm -> plugin + selected model written, path + diff preview printed', async () => {
    const target = join(dir, 'interactive-confirm.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmPatch = vi.fn().mockResolvedValue(true);
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue(interactiveRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      confirmPatch,
    });
    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith(target); // path
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@')); // diff preview
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\+.*"anthropic\/claude-3-5-sonnet"/m));
    expect(confirmPatch).toHaveBeenCalledTimes(1); // gate fired
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
      agent: { 'sdd-coder': { model: string } };
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(onDisk.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('declined'));
    log.mockRestore();
    error.mockRestore();
  });

  it('interactive + decline -> nothing written, exit 0', async () => {
    const target = join(dir, 'interactive-decline.json');
    const original = `{ "$schema": "x" }`;
    writeFileSync(target, original);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue(interactiveRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      confirmPatch: vi.fn().mockResolvedValue(false),
    });
    expect(exit).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(original); // untouched
    expect(log).toHaveBeenCalledWith(target); // path still printed
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@')); // diff preview still printed
    expect(error).toHaveBeenCalledWith(expect.stringContaining('declined'));
    log.mockRestore();
    error.mockRestore();
  });

  it('interactive + probe failure -> plugin registered, no models, warning to stderr, exit 0', async () => {
    const target = join(dir, 'interactive-degraded.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmPatch = vi.fn().mockResolvedValue(true);
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [
          'install: model step skipped (probe failed: opencode binary not found); the plugin is registered without per-subagent model assignments.',
        ],
        degraded: true,
      }),
      confirmPatch,
    });
    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith(target); // path
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@')); // plugin-only diff
    expect(error).toHaveBeenCalledWith(expect.stringContaining('model step skipped'));
    // Plugin written; no agent key (degraded -> empty Selection).
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
      agent?: unknown;
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(onDisk.agent).toBeUndefined();
    // Confirm still called on the plugin-only diff (the gate fires
    // whenever there is a non-empty diff, even in degraded mode).
    expect(confirmPatch).toHaveBeenCalledTimes(1);
    log.mockRestore();
    error.mockRestore();
  });

  it('interactive + no-op (target already patch-complete) → "no changes", gate skipped, exit 0', async () => {
    const target = join(dir, 'interactive-noop.json');
    writeFileSync(
      target,
      `{
  "plugin": ["opencode-sdd"],
  "agent": { "sdd-coder": { "model": "anthropic/claude-3-5-sonnet" } }
}`,
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmPatch = vi.fn().mockResolvedValue(true);
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue(interactiveRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      confirmPatch,
    });
    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no changes'));
    expect(confirmPatch).not.toHaveBeenCalled(); // gate skipped on no-op
    log.mockRestore();
    error.mockRestore();
  });
});
