import type { Plugin } from '@opencode-ai/plugin';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCommands, rewriteAssetReferences } from './commands/index.js';
import { createLogger } from './utils/index.js';

/**
 * Bundled commands directory, resolved relative to this module.
 *
 * Deterministic and environment-independent (`import.meta.url` never
 * changes), so it is safe to compute once at module load. It is the fallback
 * used when {@link resolveCommandsDir} finds no `SDD_COMMANDS_DIR` override.
 */
const BUNDLED_COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'commands');

/**
 * Bundled template assets directory, resolved relative to this module.
 *
 * Fallback used when {@link resolveTemplatesDir} finds no `SDD_TEMPLATES_DIR`
 * override.
 */
const BUNDLED_TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  'assets',
  'commands',
  'templates',
);

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
 * Reads `SDD_TEMPLATES_DIR` **on every call** — invoked from inside the
 * `config` hook, never captured at import time — so per-test env-var
 * overrides take effect.
 *
 * @returns Absolute path to the template assets directory.
 */
function resolveTemplatesDir(): string {
  return process.env['SDD_TEMPLATES_DIR'] ?? BUNDLED_TEMPLATES_DIR;
}

/**
 * OpenCode SDD plugin entry point.
 *
 * Loads Markdown command files from the bundled commands directory at load
 * time, rewrites the portable `@opencode-sdd-templates/` token in each
 * template to the resolved absolute templates directory (so opencode natively
 * inlines the bundled asset files via `@<abs-path>` mention resolution), and
 * spread-merges them onto `config.command`, preserving all existing user
 * commands. No agent is registered, so commands run with the user's current
 * agent. Any registration error is logged and swallowed; the plugin never
 * throws during load.
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

        // Resolve per invocation so SDD_TEMPLATES_DIR overrides are honored.
        const templatesDir = resolveTemplatesDir();

        for (const [name, commandConfig] of commands) {
          if (config.command?.[name] !== undefined) {
            await logger.warn('command name collision, overwriting', {
              command: name,
            });
          }
          // `CommandConfig.template` is `readonly`; build a new object with
          // the rewritten template so opencode inlines bundled assets via
          // native `@<abs-path>` mention resolution.
          const rewritten = rewriteAssetReferences(commandConfig.template, templatesDir);
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
    },
  };
};

export default sddPlugin;
