/**
 * The hardcoded allowlist of command names the `sdd-command` tool may load.
 *
 * Deliberately excludes the fresh-start commands (`prd-write`,
 * `prd-to-issues`) — those stages are out of scope for the orchestrator that
 * consumes this tool. Order is part of the contract: it governs the
 * `description` text and the "Available commands" string emitted on every
 * error, so it MUST stay stable.
 */
export const ALLOWED_COMMANDS: readonly string[] = [
  'prd-issue-to-plan',
  'prd-review-plan',
  'prd-implement-issue',
  'prd-validate-issue',
  'prd-validate',
] as const;

/**
 * The allowlist rendered as a comma-separated string, used verbatim in the
 * tool `description` and in every error message.
 */
export const AVAILABLE_COMMANDS: string = ALLOWED_COMMANDS.join(', ');

/**
 * Reason codes the tool emits when it cannot load a command. Every code maps
 * to the same single-line error shape; only the quoted input and the human
 * hint differ.
 */
export type CommandLoadReason = 'empty' | 'not-allowed' | 'missing' | 'unreadable';

/**
 * Format the single-line error string the tool returns for every failure
 * mode.
 *
 * The shape is fixed by the PRD:
 *
 * ```text
 * Error: "<input>" is not a loadable command. Available commands: <list>.
 * ```
 *
 * `reason` is accepted so future call sites can vary the hint without
 * changing the shape; today every reason produces the same string, but the
 * parameter keeps the signature explicit and avoids silent string drift.
 *
 * @param input - The raw `command` argument received by the tool (may be
 *   empty).
 * @param reason - Why the load failed. Unused in the current shape but
 *   required for callers to declare the failure mode.
 * @returns The exact error string (no leading/trailing whitespace, no
 *   newline).
 */
export function formatCommandError(input: string, reason: CommandLoadReason): string {
  void reason;
  return (
    `Error: "${input}" is not a loadable command. ` + `Available commands: ${AVAILABLE_COMMANDS}.`
  );
}
