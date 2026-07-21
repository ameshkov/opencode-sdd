import { describe, expect, it, vi } from 'vitest';
import { promptTarget } from './target-select.js';
import type { Candidate } from './config-resolver.js';

const project: Candidate = { source: 'project', path: '/repo/opencode.json' };
const env: Candidate = { source: 'env', path: '/custom/opencode.json' };
const glob: Candidate = {
  source: 'global',
  path: '/home/.config/opencode/opencode.json',
};

describe('promptTarget', () => {
  it('returns null without calling select when candidates is empty', async () => {
    const selectTarget = vi.fn();
    const result = await promptTarget([], { selectTarget });
    expect(result).toBeNull();
    expect(selectTarget).not.toHaveBeenCalled();
  });

  it('passes all candidates as choices in discovery order', async () => {
    const selectTarget = vi.fn().mockResolvedValue(project.path);
    await promptTarget([project, env, glob], { selectTarget });
    expect(selectTarget).toHaveBeenCalledTimes(1);
    const config = selectTarget.mock.calls[0]?.[0] as {
      message: string;
      choices: Array<{ value: string; name: string }>;
      default?: string;
    };
    expect(config.message).toContain('opencode config');
    expect(config.choices.map((c) => c.value)).toEqual([project.path, env.path, glob.path]);
    expect(config.choices[0]?.name).toContain('project');
  });

  it('pre-selects the project candidate when present', async () => {
    const selectTarget = vi.fn().mockResolvedValue(project.path);
    await promptTarget([project, glob], { selectTarget });
    const config = selectTarget.mock.calls[0]?.[0] as { default?: string };
    expect(config.default).toBe(project.path);
  });

  it('pre-selects the global candidate when only global exists', async () => {
    const selectTarget = vi.fn().mockResolvedValue(glob.path);
    await promptTarget([glob], { selectTarget });
    const config = selectTarget.mock.calls[0]?.[0] as { default?: string };
    expect(config.default).toBe(glob.path);
  });

  it('omits default when no candidates are present (covered by empty-list short-circuit)', async () => {
    // Sanity: the empty-list path returns null before select is called,
    // so no `default` field is ever constructed.
    const selectTarget = vi.fn();
    await promptTarget([], { selectTarget });
    expect(selectTarget).not.toHaveBeenCalled();
  });

  it('returns the Candidate matching the chosen path', async () => {
    const selectTarget = vi.fn().mockResolvedValue(env.path);
    const result = await promptTarget([project, env, glob], {
      selectTarget,
    });
    expect(result).toEqual(env);
  });

  it('returns null when the chosen path matches no candidate', async () => {
    const selectTarget = vi.fn().mockResolvedValue('/nonexistent.json');
    const result = await promptTarget([project], { selectTarget });
    expect(result).toBeNull();
  });

  it('returns null when select rejects with ExitPromptError (Ctrl-C → cancel, PRD exit 0)', async () => {
    const exitError = new Error('User pressed Ctrl-C');
    exitError.name = 'ExitPromptError';
    const selectTarget = vi.fn().mockRejectedValue(exitError);
    const result = await promptTarget([project], { selectTarget });
    expect(result).toBeNull();
  });

  it('rethrows non-ExitPromptError failures so main can surface them as non-zero exits', async () => {
    const selectTarget = vi.fn().mockRejectedValue(new Error('broken TTY'));
    await expect(promptTarget([project], { selectTarget })).rejects.toThrow('broken TTY');
  });

  it('renders a create-new candidate as "Create new config at <path>"', async () => {
    const synthetic: Candidate = {
      source: 'create',
      path: '/cwd/opencode.json',
    };
    const selectTarget = vi.fn().mockResolvedValue(synthetic.path);
    await promptTarget([synthetic], { selectTarget });
    const config = selectTarget.mock.calls[0]?.[0] as {
      choices: Array<{ value: string; name: string }>;
    };
    expect(config.choices[0]?.value).toBe('/cwd/opencode.json');
    expect(config.choices[0]?.name).toBe('Create new config at /cwd/opencode.json');
  });

  it('preserves the [project]/[env]/[global] label for non-create candidates', async () => {
    // Sanity: the create-source branch did not regress the existing
    // `[<source>] <path>` label for real discovery candidates.
    const selectTarget = vi.fn().mockResolvedValue(project.path);
    await promptTarget([project], { selectTarget });
    const config = selectTarget.mock.calls[0]?.[0] as {
      choices: Array<{ value: string; name: string }>;
    };
    expect(config.choices[0]?.name).toBe(`[project] ${project.path}`);
  });

  it('preserves the deps-injection default (no crash wiring the real select when not called)', async () => {
    const result = await promptTarget([]);
    expect(result).toBeNull();
  });
});
