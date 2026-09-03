import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { main } from './install.js';
import type { Candidate } from './config-resolver.js';
import type { DetectResult } from './prerequisites.js';
import type { YesSelectionResult } from './yes-selection.js';

const ok = (): DetectResult => ({ ok: true, version: '1.18.27' });

/** Build a canned YesSelectionResult for a recommended-model selection. */
function yesRecommended(agent: string, model: string): YesSelectionResult {
  return {
    selection: { models: new Map([[agent, model]]) },
    warnings: [],
    degraded: false,
  };
}

/** Build a canned YesSelectionResult for a probe-failure degraded result. */
function yesDegraded(message: string): YesSelectionResult {
  return {
    selection: {},
    warnings: [
      `install: model step skipped (probe failed: ${message}); the plugin is registered without per-subagent model assignments.`,
    ],
    degraded: true,
  };
}

describe('main (--yes end-to-end model selection)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-install-yes-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('auto-selects a recommended model, prints path + diff, writes through, no prompts', async () => {
    const target = join(dir, 'yes-recommended.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const promptTarget = vi.fn(); // must NOT be called under --yes
    const selectYesModels = vi
      .fn()
      .mockResolvedValue(yesRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet'));

    const exit = await main(['install', '--yes'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget,
      selectYesModels,
    });

    expect(exit).toBe(0);
    expect(promptTarget).not.toHaveBeenCalled(); // no prompt under --yes
    expect(selectYesModels).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(target); // resolved path printed
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@')); // diff printed before write
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\+.*"opencode-sdd"/m)); // plugin in diff
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\+.*"anthropic\/claude-3-5-sonnet"/m)); // model in diff
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
      agent: { 'sdd-coder': { model: string } };
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(onDisk.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
    log.mockRestore();
    error.mockRestore();
  });

  it('exits non-zero with a message and writes nothing when --yes + no resolvable target', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const selectYesModels = vi.fn();
    const exit = await main(['install', '--yes'], {
      detect: ok,
      enumerateCandidates: () => [],
      selectYesModels,
    });
    expect(exit).toBe(1);
    expect(selectYesModels).not.toHaveBeenCalled(); // no models step on no-target
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no resolvable target'));
    error.mockRestore();
  });

  it('prints "no changes", writes nothing, exits 0 on a --yes no-op', async () => {
    const target = join(dir, 'yes-noop.json');
    // Target already carries the plugin + every selected model — a no-op.
    const original = `{
  "plugin": ["opencode-sdd"],
  "agent": { "sdd-coder": { "model": "anthropic/claude-3-5-sonnet" } }
}`;
    writeFileSync(target, original);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install', '--yes'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      selectYesModels: vi
        .fn()
        .mockResolvedValue(yesRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
    });
    expect(exit).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(original); // byte-for-byte unchanged
    expect(log).toHaveBeenCalledWith(target); // path still printed
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no changes'));
    log.mockRestore();
    error.mockRestore();
  });

  it('degrades gracefully on probe failure: plugin registered, no models, warning to stderr, exit 0', async () => {
    const target = join(dir, 'yes-degraded.json');
    writeFileSync(target, `{ "$schema": "x" }`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install', '--yes'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      selectYesModels: vi.fn().mockResolvedValue(yesDegraded('opencode binary not found')),
    });
    expect(exit).toBe(0); // success-with-warning
    expect(log).toHaveBeenCalledWith(target); // path printed
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@')); // plugin-only diff still printed
    expect(error).toHaveBeenCalledWith(expect.stringContaining('model step skipped')); // warning to stderr (NOT stdout)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('opencode binary not found'));
    // No model values written — only the plugin entry.
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      plugin: string[];
      agent?: unknown;
    };
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(onDisk.agent).toBeUndefined();
    log.mockRestore();
    error.mockRestore();
  });

  it('re-run upgrade: a stronger recommended model now available -> path + diff + write-through', async () => {
    const target = join(dir, 'yes-upgrade.json');
    // Target carries the OLD model; the new selection upgrades it.
    const original = `{
  "plugin": ["opencode-sdd"],
  "agent": { "sdd-coder": { "model": "old/coder" } }
}`;
    writeFileSync(target, original);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install', '--yes'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      selectYesModels: vi
        .fn()
        .mockResolvedValue(yesRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
    });
    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith(target); // path printed
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@')); // diff printed before write
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^-.*"old\/coder"/m)); // old -> removed
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\+.*"anthropic\/claude-3-5-sonnet"/m)); // new -> added
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      agent: { 'sdd-coder': { model: string } };
    };
    expect(onDisk.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
    log.mockRestore();
    error.mockRestore();
  });
});
