import type { Hooks } from '@opencode-ai/plugin';
import { createToolCore, buildSurface } from '../surface.js';
import type { Logger } from '../../utils/index.js';
import { registerAgents } from './agents.js';
import { registerCommands } from './commands.js';
import { registerBundledTemplatesPermission, registerSddCommandGlobalDeny } from './permissions.js';
import { createV1Tool } from './tool.js';

/**
 * Build the opencode V1 `Hooks` object for the SDD plugin.
 *
 * The `config` hook rebuilds the SDD surface on every invocation so
 * environment overrides (`SDD_COMMANDS_DIR`, `SDD_AGENTS_DIR`,
 * `SDD_TEMPLATES_DIR`) are honored per call, then registers commands, agents,
 * the global `sdd-command` deny, and the bundled-templates permission grant.
 * Every registration step catches its own errors, so the hook never throws.
 *
 * The `tool` hook exposes `sdd-command`, wrapping the neutral core with
 * resolvers that read the environment at tool-call time.
 *
 * @param logger - V1 logger adapter (typically `createV1Logger(input.client)`).
 * @returns The V1 hooks registered by the dual plugin entry.
 */
export function createV1Hooks(logger: Logger): Hooks {
  return {
    config: async (config) => {
      const surface = await buildSurface(logger);
      await registerCommands(config, surface, logger);
      await registerAgents(config, surface, logger);
      await registerSddCommandGlobalDeny(config, logger);
      await registerBundledTemplatesPermission(config, surface.dirs.templates, logger);
    },
    tool: {
      'sdd-command': createV1Tool(createToolCore()),
    },
  };
}
