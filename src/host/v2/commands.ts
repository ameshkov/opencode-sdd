import type { Plugin } from '@opencode/plugin';
import type { CommandConfig } from '../../commands/index.js';
import { inlineAssetReferences } from '../../commands/index.js';
import type { Logger } from '../../utils/index.js';

/**
 * Substitute the V1 `$ARGUMENTS` token in a command template.
 *
 * opencode V1 performs this substitution itself when a command runs; V2 plugin
 * commands carry an `execute` closure instead, so the adapter must do it. Every
 * shipped command template contains exactly one `$ARGUMENTS` token.
 *
 * @param template - Rewritten command template.
 * @param argumentsText - User-supplied command arguments (may be empty).
 * @returns The template with every `$ARGUMENTS` token replaced.
 * @internal Exported for tests only; not part of the public module API.
 *   Production callers reach it through the command execute closure.
 */
export function substituteArguments(template: string, argumentsText: string): string {
  return template.replaceAll('$ARGUMENTS', argumentsText);
}

/**
 * Register the SDD commands on a V2 host.
 *
 * V2 has no command template field: `CommandEditor.add` takes a definition
 * whose `execute` closure performs the dispatch. V2 does not inline
 * `@<abs-path>` mentions in session prompts (verified against 2.0.14), so the
 * adapter inlines the portable `@opencode-sdd-templates/` asset references
 * itself, then sends the resulting template as a session prompt with
 * `$ARGUMENTS` substituted from the invocation. Errors are logged and
 * swallowed: a failing command must not break setup or the invoking session.
 *
 * @param ctx - V2 plugin context.
 * @param commands - Loaded command configs keyed by name.
 * @param templatesDir - Absolute bundled templates directory.
 * @param logger - Logger port.
 */
export async function registerV2Commands(
  ctx: Plugin.Context,
  commands: ReadonlyMap<string, CommandConfig>,
  templatesDir: string,
  logger: Logger,
): Promise<void> {
  try {
    await logger.info('registering SDD commands on opencode v2');

    const templates = new Map<string, string>();
    for (const [name, config] of commands) {
      const inlined = await inlineAssetReferences(config.template, templatesDir);
      for (const missing of inlined.missing) {
        await logger.warn('failed to inline command template', {
          command: name,
          template: missing,
        });
      }
      templates.set(name, inlined.text);
    }

    await ctx.command.transform((editor) => {
      for (const [name, config] of commands) {
        const template = templates.get(name) ?? config.template;
        editor.add({
          name,
          ...(config.description === undefined ? {} : { description: config.description }),
          execute: async (invocation) => {
            try {
              const argumentsText = invocation.prompt?.text ?? '';
              await ctx.session.prompt({
                sessionID: invocation.sessionID,
                text: substituteArguments(template, argumentsText),
              });
            } catch (error) {
              await logger.error('failed to dispatch SDD command', {
                command: name,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          },
        });
      }
    });

    await logger.info('SDD commands registered', { count: commands.size });
  } catch (error) {
    await logger.error('failed to register SDD commands', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
