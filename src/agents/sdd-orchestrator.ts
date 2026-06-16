import type { AgentConfig } from '@opencode-ai/sdk';

/**
 * System prompt for the SDD orchestrator agent.
 *
 * Placeholder prompt for the empty shell. It will be replaced with the full
 * specification-driven development workflow in a later iteration.
 */
const SDD_ORCHESTRATOR_PROMPT = `You are the SDD orchestrator, the coordinator of the
specification-driven development workflow.

Your responsibility is to guide the user from a vague idea to a validated
development plan WITHOUT writing implementation code yourself. You delegate
implementation work to specialist agents.

For now, this is a placeholder. Acknowledge the request and explain that the
full workflow is not yet implemented.`;

/**
 * The SDD orchestrator agent.
 *
 * Registered with opencode as a subagent that coordinates the
 * specification-driven development workflow. It never writes implementation
 * code; it delegates to specialist agents (to be added in later iterations).
 */
export const sddOrchestratorAgent: AgentConfig = {
  description:
    'Coordinates the specification-driven development workflow. Use when the' +
    ' user wants to turn a vague idea into a structured development plan.',
  mode: 'subagent',
  prompt: SDD_ORCHESTRATOR_PROMPT,
};
