import type { Config } from '@opencode-ai/plugin';

/**
 * Element type of opencode's `config.command` map.
 *
 * opencode's SDK does not export a named command type, so it is derived from
 * the merged {@link Config} shape.
 */
type CommandConfig = NonNullable<NonNullable<Config['command']>[string]>;

/**
 * Template body for the `sdd-prd-write` command.
 *
 * Placeholder template for the empty shell. It will be replaced with the full
 * PRD-authoring workflow in a later iteration.
 */
const SDD_PRD_WRITE_TEMPLATE = `Write a Product Requirements Document (PRD) for the following request:

$ARGUMENTS

Structure the PRD with these sections:

- Overview
- Goals
- Non-goals
- User stories
- Acceptance criteria
- Open questions

This is a placeholder command. The full specification-driven workflow will be
implemented in a later iteration.`;

/**
 * The `sdd-prd-write` command.
 *
 * Registered with opencode as a slash command that produces a Product
 * Requirements Document from a short user request.
 */
export const sddPrdWriteCommand: CommandConfig = {
  description: 'Write a Product Requirements Document (PRD) from a short description.',
  template: SDD_PRD_WRITE_TEMPLATE,
};
