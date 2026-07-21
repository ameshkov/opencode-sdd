import { select } from '@inquirer/prompts';
import { pickDefault, type Candidate } from './config-resolver.js';

/**
 * Minimal choice shape for the string-valued target prompt. A subset
 * of `@inquirer/prompts`'s `Choice<string>` (omits `description`,
 * `short`, and `Separator`), structurally compatible with the real
 * `select` so `deps.selectTarget ?? select` type-checks.
 */
interface TargetChoice {
  value: string;
  name?: string;
  disabled?: boolean | string;
}

/** Optional dependencies of {@link promptTarget}. */
interface TargetSelectDeps {
  /**
   * Override the prompt call (used by tests). Defaults to the real
   * `select` from `@inquirer/prompts`.
   */
  selectTarget?: (config: {
    message: string;
    choices: readonly TargetChoice[];
    default?: string;
  }) => Promise<string>;
}

const TARGET_PROMPT_MESSAGE = 'Select the opencode config to patch:';

/**
 * Build the inquirer `choices` list from candidates, preserving
 * discovery order (project -> env -> global). Each choice's `value`
 * is the absolute path and its `name` prefixes the source for
 * scannability (e.g. `[project] /repo/opencode.json`). The
 * wizard-only `'create'` source (never produced by
 * {@link enumerateCandidates}) renders as
 * `Create new config at <path>` instead of the opaque
 * `[create] <path>`, so the create-new choice is clearly worded.
 */
function buildChoices(candidates: readonly Candidate[]): TargetChoice[] {
  return candidates.map((c) => ({
    value: c.path,
    name: c.source === 'create' ? `Create new config at ${c.path}` : `[${c.source}] ${c.path}`,
  }));
}

/**
 * Prompt the user to pick one of `candidates` via
 * `@inquirer/prompts.select`. The default cursor lands on
 * {@link pickDefault}'s choice (project when present, otherwise
 * global, otherwise env). Returns the selected `Candidate`, or `null`
 * when the candidate list is empty (no prompt is shown) or the user
 * cancels via Ctrl-C.
 *
 * Error narrowing: `@inquirer/prompts` rejects Ctrl-C with an
 * `ExitPromptError` (the class itself lives in `@inquirer/core` and
 * is not re-exported by `@inquirer/prompts`). Per the maintainer's
 * documented recommendation, the catch narrows with the string check
 * `error.name === 'ExitPromptError'` rather than `instanceof` (which
 * is fragile across bundler module boundaries). Any other failure
 * (broken TTY, aborted stdin, etc.) is rethrown so `main`'s
 * top-level guard surfaces it as a non-zero exit with a message —
 * satisfying the wizard's "any phase error -> non-zero exit with a
 * message" policy. A bare `catch {}` that swallowed everything would
 * mask real prompt failures as a zero-exit cancel, which is
 * incorrect.
 */
export async function promptTarget(
  candidates: readonly Candidate[],
  deps: TargetSelectDeps = {},
): Promise<Candidate | null> {
  if (candidates.length === 0) {
    return null;
  }
  const def = pickDefault(candidates);
  const selectTarget = deps.selectTarget ?? select;
  try {
    const chosen = await selectTarget({
      message: TARGET_PROMPT_MESSAGE,
      choices: buildChoices(candidates),
      ...(def === null ? {} : { default: def.path }),
    });
    return candidates.find((c) => c.path === chosen) ?? null;
  } catch (error) {
    // Ctrl-C / abort maps to a cancel (exit 0). `ExitPromptError` is
    // detected by `name` so no `@inquirer/core` import is needed.
    if (error instanceof Error && error.name === 'ExitPromptError') {
      return null;
    }
    // Any other failure is a phase error — rethrow so `main`'s
    // top-level try/catch logs it and returns a non-zero exit.
    throw error;
  }
}
