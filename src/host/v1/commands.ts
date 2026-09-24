import type { Config } from '@opencode-ai/plugin';
import { rewriteAssetReferences, type Logger } from '../../utils/index.js';
import type { Surface } from '../surface.js';

/**
 * Register the SDD commands from a loaded surface onto `config.command`,
 * rewriting each template's `@opencode-sdd-templates/` token to the resolved
 * absolute templates directory. Spread-merges onto any existing user commands;
 * a colliding command is fully replaced (its template is the plugin's
 * contract) and the overwrite is logged as a warning. Any error is logged and
 * swallowed so the hook never throws.
 *
 * @param config - opencode's live merged config, mutated in place.
 * @param surface - Loaded commands plus resolved directories.
 * @param logger - Logger port.
 */
export async function registerCommands(
  config: Config,
  surface: Surface,
  logger: Logger,
): Promise<void> {
  try {
    await logger.info('loading SDD commands');

    const { commands, dirs } = surface;
    for (const [name, commandConfig] of commands) {
      if (config.command?.[name] !== undefined) {
        await logger.warn('command name collision, overwriting', {
          command: name,
        });
      }
      // `CommandConfig.template` is `readonly`; build a new object with
      // the rewritten template so opencode inlines bundled assets via
      // native `@<abs-path>` mention resolution.
      const rewritten = rewriteAssetReferences(commandConfig.template, dirs.templates);
      config.command = {
        ...config.command,
        [name]: { ...commandConfig, template: rewritten },
      };
      await logger.debug('registered command', { command: name });
    }

    await logger.info('SDD commands registered', {
      count: commands.size,
    });
  } catch (error) {
    await logger.error('failed to register SDD commands', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
