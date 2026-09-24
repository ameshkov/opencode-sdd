import type { Config } from '@opencode-ai/plugin';
import type { Logger } from '../../utils/index.js';

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
 *
 * @param config - opencode's live merged config, mutated in place.
 * @param logger - Logger port.
 */
export async function registerSddCommandGlobalDeny(config: Config, logger: Logger): Promise<void> {
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
 * templates directory is only known at runtime, so the grant is a
 * `<dir>/**` path-glob rule layered onto
 * `config.permission.external_directory`.
 *
 * Spread-merges onto any existing user permission, preserving their other
 * categories (read/edit/bash/...) and any path-glob rules already under
 * `external_directory`. A global string action is respected rather than
 * loosened: `"allow"` already covers the bundled templates (no-op), while
 * `"ask"` (the default for other external dirs) is preserved by replacing it
 * with a map granting only our glob; `"deny"` is left untouched (the user
 * explicitly opted into a strict external posture). The SDK type models
 * `external_directory` as a plain action, but the runtime — and the v2 SDK
 * type — also accept a path-glob map; the merged map is therefore cast onto
 * `config.permission`, the same escape hatch the agent frontmatter parser
 * uses for parsed-YAML permission maps. Any error is logged and swallowed so
 * the hook never throws.
 *
 * @param config - opencode's live merged config, mutated in place.
 * @param templatesDir - Absolute templates directory to grant access to.
 * @param logger - Logger port.
 */
export async function registerBundledTemplatesPermission(
  config: Config,
  templatesDir: string,
  logger: Logger,
): Promise<void> {
  try {
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
