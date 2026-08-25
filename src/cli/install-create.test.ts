import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

describe('main (create-new config path)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdd-install-create-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('create-new + confirm -> skeleton + selected model written in valid JSON', async () => {
    const target = join(dir, 'create-confirm.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmPatch = vi.fn().mockResolvedValue(true);
    // promptTarget is injected to return a create-new candidate whose
    // path is the tmp target — main's createNewConfig builds the
    // synthetic candidate (joining env.cwd with `opencode.json`) and
    // hands it to promptTarget; the test overrides the returned path
    // to point at a tmp file (so the test never touches process.cwd).
    const promptTarget = vi.fn().mockResolvedValue({ source: 'create', path: target } as Candidate);
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [],
      promptTarget,
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue(interactiveRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      confirmPatch,
    });
    expect(exit).toBe(0);
    // The create-new candidate was passed to promptTarget as the
    // only choice (proves createNewConfig built + dispatched the
    // synthetic candidate).
    expect(promptTarget).toHaveBeenCalledWith([expect.objectContaining({ source: 'create' })]);
    // The resolved target's path is printed to stdout.
    expect(log).toHaveBeenCalledWith(target);
    // The diff (the agent-model added on top of the skeleton — the
    // plugin step is a no-op because the skeleton already has
    // `"plugin": ["opencode-sdd"]`) is printed before the write.
    expect(log).toHaveBeenCalledWith(expect.stringContaining('@@'));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\+.*"anthropic\/claude-3-5-sonnet"/m));
    // The written file is valid JSON with the $schema, plugin, and
    // agent keys.
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      $schema: string;
      plugin: string[];
      agent: { 'sdd-coder': { model: string } };
    };
    expect(onDisk.$schema).toBe('https://opencode.ai/config.json');
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(onDisk.agent['sdd-coder'].model).toBe('anthropic/claude-3-5-sonnet');
    log.mockRestore();
    error.mockRestore();
  });

  it('create-new + decline create-new prompt -> no file written, exit 0', async () => {
    const target = join(dir, 'create-declined-create.json');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const promptTarget = vi.fn().mockResolvedValue(null); // user cancels the create-new choice
    const selectInteractiveModels = vi.fn();
    const confirmPatch = vi.fn();
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [],
      promptTarget,
      selectInteractiveModels,
      confirmPatch,
    });
    expect(exit).toBe(0);
    expect(selectInteractiveModels).not.toHaveBeenCalled(); // no model step on a user-cancel
    expect(confirmPatch).not.toHaveBeenCalled();
    expect(() => readFileSync(target, 'utf8')).toThrow(); // no file created
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no target selected'));
    error.mockRestore();
  });

  it('create-new + confirm-decline -> skeleton remains on disk (no models), exit 0', async () => {
    const target = join(dir, 'create-gate-decline.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const confirmPatch = vi.fn().mockResolvedValue(false); // declined at the gate
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [],
      promptTarget: vi.fn().mockResolvedValue({ source: 'create', path: target } as Candidate),
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue(interactiveRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      confirmPatch,
    });
    expect(exit).toBe(0);
    expect(confirmPatch).toHaveBeenCalledTimes(1); // gate fired on the diff preview
    expect(error).toHaveBeenCalledWith(expect.stringContaining('declined'));
    // The skeleton was written (the first write in createNewConfig)
    // before the gate; the patched version (the second write in
    // applyConfigPatch) is NOT written because the user declined.
    // The skeleton is a valid minimal config — the re-run path picks
    // it up via enumerateCandidates and patches in the models.
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      $schema: string;
      plugin: string[];
      agent?: unknown;
    };
    expect(onDisk.$schema).toBe('https://opencode.ai/config.json');
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(onDisk.agent).toEqual({}); // skeleton's empty agent object — no models (gate declined)
    log.mockRestore();
    error.mockRestore();
  });

  it('re-run idempotency over the create-then-edit cycle', async () => {
    const target = join(dir, 'create-rerun.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First run: empty candidates -> create-new -> skeleton + model written.
    const firstPromptTarget = vi
      .fn()
      .mockResolvedValue({ source: 'create', path: target } as Candidate);
    const firstExit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [],
      promptTarget: firstPromptTarget,
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue(interactiveRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });
    expect(firstExit).toBe(0);
    expect(firstPromptTarget).toHaveBeenCalledWith([expect.objectContaining({ source: 'create' })]);
    const firstOnDisk = readFileSync(target, 'utf8');

    // Second run: now the file exists -> enumerateCandidates discovers
    // it as a project candidate -> edit-existing path -> patcher's
    // noChanges short-circuit fires (selection equals current) ->
    // "no changes", file byte-for-byte unchanged.
    const secondExit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [{ source: 'project', path: target } as Candidate],
      promptTarget: vi.fn().mockResolvedValue({ source: 'project', path: target } as Candidate),
      selectInteractiveModels: vi
        .fn()
        .mockResolvedValue(interactiveRecommended('sdd-coder', 'anthropic/claude-3-5-sonnet')),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });
    expect(secondExit).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(firstOnDisk); // byte-identical (idempotency)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no changes'));
    log.mockRestore();
    error.mockRestore();
  });

  it('create-new + probe failure -> skeleton + plugin-only written, no models, warning to stderr, exit 0', async () => {
    const target = join(dir, 'create-degraded.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = await main(['install'], {
      detect: ok,
      enumerateCandidates: () => [],
      promptTarget: vi.fn().mockResolvedValue({ source: 'create', path: target } as Candidate),
      selectInteractiveModels: vi.fn().mockResolvedValue({
        selection: {},
        warnings: [
          'install: model step skipped (probe failed: opencode binary not found); the plugin is registered without per-subagent model assignments.',
        ],
        degraded: true,
      }),
      confirmPatch: vi.fn().mockResolvedValue(true),
    });
    expect(exit).toBe(0);
    expect(log).toHaveBeenCalledWith(target); // path
    // The skeleton already has the plugin entry and the empty selection
    // carries no model assignments -> computePatch returns noChanges
    // (a no-op). No diff is printed; the "no changes" message is.
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no changes'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('model step skipped'));
    // The skeleton is the created file's content — $schema / plugin
    // exist (written by the skeleton write), agent is {}.
    const onDisk = JSON.parse(readFileSync(target, 'utf8')) as {
      $schema: string;
      plugin: string[];
      agent?: unknown;
    };
    expect(onDisk.$schema).toBe('https://opencode.ai/config.json');
    expect(onDisk.plugin).toEqual(['opencode-sdd']);
    expect(onDisk.agent).toEqual({}); // degraded -> empty agent object, no model assignments
    log.mockRestore();
    error.mockRestore();
  });
});
