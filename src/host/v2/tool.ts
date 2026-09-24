import type { Info as V2ToolInfo } from '@opencode/plugin/promise/tool';
import type { Plugin } from '@opencode/plugin';
import type { SddCommandToolCore } from '../../sdd-command/index.js';
import type { Logger } from '../../utils/index.js';
import { SDD_COMMAND_PERMISSION } from './permissions.js';

/**
 * Register the `sdd-command` tool on a V2 host.
 *
 * Two V2-specific details make the tool behave like its V1 counterpart:
 *
 * - `options.codemode: false` exposes the tool directly to the model. V2
 *   otherwise folds plugin tools into the CodeMode `execute` tool, which would
 *   change the calling convention the SDD agent prompts rely on.
 * - `options.permission: 'sdd-command'` makes the tool's permission action
 *   match the V1 permission key, so the per-agent rules registered by
 *   `host/v2/agents.ts` gate it (V2 excludes tools whose effective rule is a
 *   `*` deny from the agent's tool snapshot).
 *
 * The result is returned as `content` (not `output`) because V2 requires an
 * output schema whenever `output` is set, and the core's result is plain text.
 *
 * @param ctx - V2 plugin context.
 * @param core - Neutral tool core.
 * @param logger - Logger port.
 */
export async function registerV2Tool(
  ctx: Plugin.Context,
  core: SddCommandToolCore,
  logger: Logger,
): Promise<void> {
  try {
    await logger.info('registering sdd-command tool on opencode v2');

    const definition = {
      name: SDD_COMMAND_PERMISSION,
      description: core.description,
      input: core.inputSchema,
      options: { codemode: false, permission: SDD_COMMAND_PERMISSION },
      execute: async (input: unknown) => ({ content: await core.execute(input) }),
    } as unknown as V2ToolInfo;

    await ctx.tool.transform((editor) => {
      editor.add(definition);
    });

    await logger.info('sdd-command tool registered');
  } catch (error) {
    await logger.error('failed to register sdd-command tool', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
