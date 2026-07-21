import { confirm } from '@inquirer/prompts';

/**
 * Optional dependencies of {@link confirmPatch}. Mirrors the
 * `TargetSelectDeps` pattern: a single injectable `confirmApply`
 * function used by tests to stub the `@inquirer/prompts confirm` call.
 * Defaults to the real `confirm`.
 */
export interface ConfirmPatchDeps {
  /** Override the prompt call (used by tests). Defaults to `confirm`. */
  readonly confirmApply?: (config: { message: string; default?: boolean }) => Promise<boolean>;
}

/** The prompt message shown at the gate. */
const CONFIRM_MESSAGE = 'Apply this patch?';

/**
 * The confirmation gate: asks the user to confirm before the single
 * end-of-run atomic write. The wizard has ALREADY printed the unified
 * diff to stdout (the preview) by the time this fires — this wrapper
 * only owns the yes/no prompt.
 *
 * Returns `true` on confirm, `false` on decline. Ctrl-C
 * (ExitPromptError) is treated as a decline -> `false`, so an
 * interrupt at the gate maps to "no file written, exit 0" — the same
 * outcome as an explicit decline. Any other failure (broken TTY, ...)
 * is rethrown so `main`'s top-level guard surfaces it as a non-zero
 * exit (mirrors `promptTarget`'s error-narrowing policy).
 *
 * The default cursor lands on `true` (Enter = confirm), so the common
 * re-run path where the user already reviewed the diff is a single
 * keystroke.
 *
 * @param deps Optional test double for the `confirm` call.
 */
export async function confirmPatch(deps: ConfirmPatchDeps = {}): Promise<boolean> {
  const confirmApply = deps.confirmApply ?? confirm;
  try {
    return await confirmApply({ message: CONFIRM_MESSAGE, default: true });
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      return false;
    }
    throw error;
  }
}
