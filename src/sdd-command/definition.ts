import { tool, type ToolDefinition } from '@opencode-ai/plugin';
import { rewriteAssetReferences } from '../commands/index.js';
import { ALLOWED_COMMANDS, AVAILABLE_COMMANDS, formatCommandError } from './allowlist.js';
import { loadCommandSource } from './source-loader.js';

/**
 * Injected directory resolvers. The tool resolves both directories per
 * `execute` call (not at factory time) so per-invocation environment overrides
 * (`SDD_COMMANDS_DIR`, `SDD_TEMPLATES_DIR`) take effect, mirroring the
 * `config` hook's own per-call resolution in `src/index.ts`. Injecting the
 * resolvers (rather than importing them from the entry point) keeps this
 * definition module below the entry point in the dependency graph.
 */
export interface SddCommandToolDeps {
  /** Returns the absolute commands directory to read `<name>.md` from. */
  resolveCommandsDir(): string;
  /** Returns the absolute templates directory used to rewrite the token. */
  resolveTemplatesDir(): string;
}

/**
 * Build the `sdd-command` {@link ToolDefinition}.
 *
 * The tool loads an allowlisted command's Markdown body, rewrites every
 * `@opencode-sdd-templates/` mention to `@<templatesDir>/`, and returns the
 * header line + blank line + rewritten body. Every failure (empty arg, not
 * allowlisted, missing/unreadable source) returns the single-line error
 * string produced by {@link formatCommandError}; the tool never throws.
 */
export function createSddCommandTool(deps: SddCommandToolDeps): ToolDefinition {
  const allowset = new Set(ALLOWED_COMMANDS);
  return tool({
    description: `Load a command's instructions. Available commands: ` + `${AVAILABLE_COMMANDS}.`,
    args: {
      command: tool.schema
        .string()
        .describe('Name of the command to load; must be one of: ' + AVAILABLE_COMMANDS + '.'),
    },
    async execute(args) {
      const input = args.command;
      if (typeof input !== 'string' || input === '') {
        return formatCommandError(String(input ?? ''), 'empty');
      }
      if (!allowset.has(input)) {
        return formatCommandError(input, 'not-allowed');
      }
      const result = await loadCommandSource(input, deps.resolveCommandsDir());
      if (!result.ok) {
        return formatCommandError(input, result.reason);
      }
      const templatesDir = deps.resolveTemplatesDir();
      const rewritten = rewriteAssetReferences(result.body, templatesDir);
      return `Loaded command "${input}" from ${result.absPath}.\n\n${rewritten}`;
    },
  });
}
