import type { Plugin } from '@opencode-ai/plugin';
import { sddOrchestratorAgent } from './agents/index.js';
import { sddPrdWriteCommand } from './commands/index.js';

/**
 * OpenCode SDD plugin entry point.
 *
 * Registers the specification-driven development surface with opencode via the
 * `config` hook:
 *
 * - the `sdd-orchestrator` agent (coordinator of the SDD workflow)
 * - the `sdd-prd-write` command (writes a Product Requirements Document)
 *
 * Existing user configuration for these keys is preserved; the plugin only adds
 * the entries if they are absent (spread-merge, last-write-wins within this
 * hook).
 */
const sddPlugin: Plugin = async () => {
  return {
    config: async (config) => {
      config.agent = {
        ...config.agent,
        'sdd-orchestrator': sddOrchestratorAgent,
      };

      config.command = {
        ...config.command,
        'sdd-prd-write': sddPrdWriteCommand,
      };
    },
  };
};

export default sddPlugin;
