import type { Config } from '@opencode-ai/plugin';
import type { Logger } from '../../utils/index.js';
import type { Surface } from '../surface.js';

/**
 * Register the SDD agents from a loaded surface onto `config.agent`,
 * spread-merged onto any existing user agents. On collision the plugin config
 * is spread on top of the user's entry so plugin fields
 * (`description`, `mode`, `permission`, `prompt`) win while user-only fields
 * the plugin never sets (notably `model`, e.g. from `opencode.json`) are
 * preserved instead of clobbered. Any error is logged and swallowed so the
 * hook never throws.
 *
 * @param config - opencode's live merged config, mutated in place.
 * @param surface - Loaded agents.
 * @param logger - Logger port.
 */
export async function registerAgents(
  config: Config,
  surface: Surface,
  logger: Logger,
): Promise<void> {
  try {
    await logger.info('loading SDD agents');

    const { agents } = surface;
    for (const [name, agentConfig] of agents) {
      const existing = config.agent?.[name];
      if (existing !== undefined) {
        await logger.warn('agent name collision, merging onto existing config', {
          agent: name,
        });
        config.agent = { ...config.agent, [name]: { ...existing, ...agentConfig } };
      } else {
        config.agent = { ...config.agent, [name]: agentConfig };
      }
      await logger.debug('registered agent', { agent: name });
    }

    await logger.info('SDD agents registered', { count: agents.size });
  } catch (error) {
    await logger.error('failed to register SDD agents', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
