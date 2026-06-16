import type { Plugin } from '@opencode-ai/plugin';
import { sddOrchestratorAgent } from './agents/index.js';
import { sddPrdWriteCommand } from './commands/index.js';
import { createLogger } from './utils/index.js';

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
 * hook). Diagnostic output is sent to opencode's server logs through the SDK
 * client via the internal logger.
 */
const sddPlugin: Plugin = async (input) => {
  const logger = createLogger(input.client);

  await logger.info('plugin loading');

  return {
    config: async (config) => {
      try {
        await logger.info('registering SDD surface');

        config.agent = {
          ...config.agent,
          'sdd-orchestrator': sddOrchestratorAgent,
        };
        await logger.debug('registered agent "sdd-orchestrator"');

        config.command = {
          ...config.command,
          'sdd-prd-write': sddPrdWriteCommand,
        };
        await logger.debug('registered command "sdd-prd-write"');

        await logger.info('SDD surface registered');
      } catch (error) {
        await logger.error('failed to register SDD surface', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
};

export default sddPlugin;
