import type { Config, Plugin } from '@opencode-ai/plugin';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCommands, rewriteAssetReferences } from './commands/index.js';
import { loadAgents } from './agents/index.js';
import { createSddCommandTool } from './sdd-command/index.js';
import { createLogger, type Logger } from './utils/index.js';

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
 * Bundled agents directory, resolved relative to this module.
 *
 * Fallback used when {@link resolveAgentsDir} finds no `SDD_AGENTS_DIR`
 * override.
 */
const BUNDLED_AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'assets', 'agents');

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
 * Resolve the agents directory for the current invocation.
 *
 * Reads `SDD_AGENTS_DIR` **on every call** — invoked from inside the
 * `config` hook, never captured at import time — so per-test env-var
 * overrides take effect.
 *
 * @returns Absolute path to the agents directory.
 */
function resolveAgentsDir(): string {
  return process.env['SDD_AGENTS_DIR'] ?? BUNDLED_AGENTS_DIR;
}

/**
 * Register the SDD commands from the resolved commands directory onto
 * `config.command`, rewriting each template's `@opencode-sdd-templates/`
 * token to the resolved absolute templates directory. Spread-merges onto
 * any existing user commands. Any error is logged and swallowed so the
 * hook never throws.
 */
async function registerCommands(config: Config, logger: Logger): Promise<void> {
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
}

/**
 * Register the SDD agents from the resolved agents directory onto
 * `config.agent`, spread-merged onto any existing user agents. Any error is
 * logged and swallowed so the hook never throws.
 */
async function registerAgents(config: Config, logger: Logger): Promise<void> {
  try {
    await logger.info('loading SDD agents');

    // Resolve per invocation so SDD_AGENTS_DIR overrides are honored.
    const agents = await loadAgents(resolveAgentsDir(), logger);

    for (const [name, agentConfig] of agents) {
      const existing = config.agent?.[name];
      if (existing !== undefined) {
        // The plugin defines description/mode/permission/tools/prompt but
        // never `model` (or other user-only fields). Spread the plugin config
        // on top of the user's entry so plugin fields win while a user-set
        // `model` (e.g. from opencode.json) is preserved instead of clobbered.
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

/** An opencode permission action for a single rule. */
type PermissionAction = 'ask' | 'allow' | 'deny';

/**
 * A value allowed under a `permission` category that supports per-key rules
 * (such as `external_directory`): either a single action applying to every
 * key, or a map of path/glob keys to actions.
 */
type ExternalDirectoryRule = PermissionAction | Record<string, PermissionAction>;

/** The `permission` key that gates the custom `sdd-command` tool. */
const SDD_COMMAND_PERMISSION = 'sdd-command';

/**
 * Globally deny the `sdd-command` tool by setting
 * `config.permission['sdd-command'] = 'deny'` (spread-merged onto any existing
 * user permission). The SDD worker agents override this per-agent with
 * `permission: { sdd-command: allow }` in their frontmatter, which takes
 * precedence over the global rule.
 *
 * `permission` — not the deprecated `tools` field — is the mechanism that
 * actually gates a plugin-registered tool name at runtime: `tools['sdd-command']
 * = false` is silently ignored for custom tools (verified against opencode
 * 1.17.8 and 1.18.23), while a per-agent `permission` entry is honoured as of
 * opencode 1.18.23.
 *
 * A global string posture is respected rather than rewritten: `"deny"` and
 * `"ask"` already restrict the tool, and converting either into object form
 * would silently change the action of every other tool. A global `"allow"`
 * leaves the tool open to non-SDD agents, which is surfaced as a warning — the
 * bundled agents still carry their own explicit rule either way. An
 * `sdd-command` entry the user set themselves is left untouched. Any error is
 * logged and swallowed so the hook never throws.
 */
async function registerSddCommandGlobalDeny(config: Config, logger: Logger): Promise<void> {
  try {
    await logger.info('registering sdd-command global deny');

    if (typeof config.permission === 'string') {
      if (config.permission === 'allow') {
        await logger.warn('cannot deny sdd-command: permission is a global "allow"');
      } else {
        await logger.debug('permission is a global string; sdd-command already restricted', {
          permission: config.permission,
        });
      }
      return;
    }

    const existing = (config.permission as Record<string, unknown> | undefined)?.[
      SDD_COMMAND_PERMISSION
    ];
    if (existing !== undefined) {
      await logger.debug('sdd-command permission already set by user; left untouched', {
        permission: String(existing),
      });
      return;
    }

    config.permission = {
      ...config.permission,
      [SDD_COMMAND_PERMISSION]: 'deny',
    } as unknown as Config['permission'];
    await logger.debug('registered sdd-command global deny');
  } catch (error) {
    await logger.error('failed to register sdd-command global deny', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Grant `external_directory` read access to the bundled template assets
 * directory so an SDD worker that reads a template file via opencode's
 * `read` tool is not gated behind a permission prompt. The absolute
 * templates directory is only known at runtime ({@link resolveTemplatesDir}),
 * so the grant is a `<dir>/**` path-glob rule layered onto
 * `config.permission.external_directory`.
 *
 * Spread-merges onto any existing user permission, preserving their other
 * categories (read/edit/bash/...) and any path-glob rules already under
 * `external_directory`. A global string action is respected rather than
 * loosened: `"allow"` already covers the bundled templates (no-op), while
 * `"ask"` (the default for other external dirs) is preserved by replacing it
 * with a map granting only our glob and `"deny"` is left untouched (the user
 * explicitly opted into a strict external posture). The SDK type models
 * `external_directory` as a plain action, but the runtime — and the v2 SDK
 * type — also accept a path-glob map; the merged map is therefore cast onto
 * `config.permission`, the same escape hatch the agent frontmatter parser
 * uses for parsed-YAML permission maps. Any error is logged and swallowed so
 * the hook never throws.
 */
async function registerBundledTemplatesPermission(config: Config, logger: Logger): Promise<void> {
  try {
    const templatesDir = resolveTemplatesDir();
    await logger.info('granting external_directory access to bundled templates');

    // The SDK type models a top-level string permission as impossible, but
    // the opencode runtime accepts `permission: "allow"` etc. from user
    // config. A global string is a deliberate posture we never loosen by
    // converting it to object form: "allow" already covers the templates
    // (no-op); anything else is left to the user to exempt via object form.
    if (typeof config.permission === 'string') {
      if (config.permission === 'allow') {
        await logger.debug('permission is global "allow"; templates already permitted');
      } else {
        await logger.warn('cannot grant templates access: permission is a global string', {
          permission: config.permission,
        });
      }
      return;
    }

    const existingExt = config.permission?.external_directory as ExternalDirectoryRule | undefined;

    // `external_directory` is either a plain action (applies to every
    // external dir) or a path-glob map. "allow" already permits the
    // templates; "deny" is a strict posture we must not loosen (other dirs
    // would drop to the default "ask"); "ask" is the default for other
    // dirs, so replacing it with a map granting only our glob preserves
    // intent while opening the templates.
    if (existingExt === 'allow') {
      await logger.debug('external_directory is "allow"; templates already permitted');
      return;
    }
    if (existingExt === 'deny') {
      await logger.warn('cannot grant templates access: external_directory is "deny"');
      return;
    }

    const ruleKey = `${templatesDir}/**`;
    const merged: Record<string, PermissionAction> =
      typeof existingExt === 'string'
        ? // Only "ask" remains here. Other external dirs already default to
          // "ask", so a map listing only our glob preserves their intent.
          { [ruleKey]: 'allow' }
        : { ...(existingExt ?? {}), [ruleKey]: 'allow' };
    config.permission = {
      ...config.permission,
      external_directory: merged,
    } as unknown as Config['permission'];
    await logger.debug('granted external_directory access to bundled templates', {
      rule: ruleKey,
    });
  } catch (error) {
    await logger.error('failed to register bundled templates permission', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * OpenCode SDD plugin entry point.
 *
 * Loads Markdown command files from the bundled commands directory at load
 * time, rewrites the portable `@opencode-sdd-templates/` token in each
 * template to the resolved absolute templates directory (so opencode natively
 * inlines the bundled asset files via `@<abs-path>` mention resolution), and
 * spread-merges them onto `config.command`, preserving all existing user
 * commands. SDD agents are registered under `config.agent` (spread-merged,
 * preserving existing user agents). The `sdd-command` tool is registered
 * under the `tool` hook and globally denied via `config.tools`. The bundled
 * templates directory is also granted `external_directory` read access so
 * SDD workers reading template files are not gated behind a prompt. Any
 * registration error is logged and swallowed; the plugin never throws during
 * load.
 */
const sddPlugin: Plugin = async (input) => {
  const logger = createLogger(input.client);

  await logger.info('plugin loading');

  return {
    config: async (config) => {
      await registerCommands(config, logger);
      await registerAgents(config, logger);
      await registerSddCommandGlobalDeny(config, logger);
      await registerBundledTemplatesPermission(config, logger);
    },
    tool: {
      'sdd-command': createSddCommandTool({
        resolveCommandsDir,
        resolveTemplatesDir,
      }),
    },
  };
};

export default sddPlugin;
