import type { Plugin } from '@opencode-ai/plugin';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCommands } from './commands/index.js';
import { resolveTemplatesReference, TEMPLATES_REFERENCE_ALIAS } from './references/index.js';
import { createLogger } from './utils/index.js';

/**
 * Bundled commands directory, resolved relative to this module.
 *
 * Deterministic and environment-independent (`import.meta.url` never
 * changes), so it is safe to compute once at module load. It is the fallback
 * used when {@link resolveCommandsDir} finds no `SDD_COMMANDS_DIR` override.
 */
const BUNDLED_COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'commands', 'markdown');

/**
 * Bundled template assets directory, resolved relative to this module.
 *
 * Fallback used when {@link resolveAssetsDir} finds no `SDD_ASSETS_DIR`
 * override.
 */
const BUNDLED_ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets');

/**
 * Resolve the commands directory to load from for the current invocation.
 *
 * Reads `SDD_COMMANDS_DIR` **on every call** — invoked from inside the
 * `config` hook, never captured into a module-level constant at import time
 * — so that per-test environment-variable overrides take effect: tests set
 * (and reset) the env var around each call to the hook, and the hook observes
 * the value current at call time. When unset, falls back to the bundled
 * directory resolved from `import.meta.url`.
 *
 * @returns Absolute path to the commands directory to load from.
 */
function resolveCommandsDir(): string {
  return process.env['SDD_COMMANDS_DIR'] ?? BUNDLED_COMMANDS_DIR;
}

/**
 * Resolve the template assets directory for the current invocation.
 *
 * Reads `SDD_ASSETS_DIR` **on every call** — invoked from inside the
 * `config` hook, never captured at import time — so per-test env-var
 * overrides take effect.
 *
 * @returns Absolute path to the template assets directory.
 */
function resolveAssetsDir(): string {
  return process.env['SDD_ASSETS_DIR'] ?? BUNDLED_ASSETS_DIR;
}

/**
 * OpenCode SDD plugin entry point.
 *
 * Loads Markdown command files from the bundled commands directory at load
 * time and spread-merges them onto `config.command`, preserving all existing
 * user commands. No agent is registered, so commands run with the user's
 * current agent. Any registration error is logged and swallowed; the plugin
 * never throws during load.
 */
const sddPlugin: Plugin = async (input) => {
  const logger = createLogger(input.client);

  await logger.info('plugin loading');

  return {
    config: async (config) => {
      try {
        await logger.info('loading SDD commands');

        // Resolve per invocation so SDD_COMMANDS_DIR overrides are honored.
        const commands = await loadCommands(resolveCommandsDir(), logger);

        for (const [name, commandConfig] of commands) {
          if (config.command?.[name] !== undefined) {
            await logger.warn('command name collision, overwriting', {
              command: name,
            });
          }
          config.command = { ...config.command, [name]: commandConfig };
          await logger.debug('registered command', { command: name });
        }

        await logger.info('SDD commands registered', {
          count: commands.size,
        });

        await logger.info('loading SDD templates reference');

        const reference = await resolveTemplatesReference(resolveAssetsDir(), logger);
        if (reference !== undefined) {
          // The SDK Config type may not yet declare `references`; opencode
          // runtime accepts it. Use a local widened type for the assignment.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cfg = config as any;
          cfg.references = {
            ...cfg.references,
            [TEMPLATES_REFERENCE_ALIAS]: reference,
          };
          await logger.debug('registered templates reference', {
            alias: TEMPLATES_REFERENCE_ALIAS,
          });
        }
        // When reference is undefined, resolveTemplatesReference already
        // logged a warning; commands remain registered.
      } catch (error) {
        await logger.error('failed to register SDD commands', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
};

export default sddPlugin;
