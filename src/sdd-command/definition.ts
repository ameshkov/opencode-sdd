import type { ToolDefinition } from '@opencode-ai/plugin';
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
 * Argument values opencode passes to the tool's `execute`.
 *
 * opencode decodes the LLM-produced arguments against the tool's JSON Schema
 * and hands the result to `execute` as a plain object. The registry's runtime
 * `parameters` falls back to `Schema.Unknown` for non-Zod `args` (see the
 * {@link createSddCommandTool} docblock), so the value is typed `unknown` and
 * validated manually inside `execute`.
 */
interface SddCommandExecuteArgs {
  command: unknown;
}

/**
 * Build the `sdd-command` {@link ToolDefinition}.
 *
 * The tool loads an allowlisted command's Markdown body, rewrites every
 * `@opencode-sdd-templates/` mention to `@<templatesDir>/`, and returns the
 * header line + blank line + rewritten body. Every failure (empty arg, not
 * allowlisted, missing/unreadable source) returns the single-line error
 * string produced by {@link formatCommandError}; the tool never throws.
 *
 * The `args` field is a plain JSON Schema fragment (not a Zod schema). This is
 * deliberate: opencode's plugin-tool registry (`fromPlugin` in
 * `packages/opencode/src/tool/registry.ts`) duck-types each `args` entry with
 * the `"_zod" in value` check and, for non-Zod entries, builds the LLM-facing
 * JSON Schema via its `legacyJsonSchema` fallback (wrapping each fragment as a
 * property). Producing a plain fragment here avoids importing `tool.schema`
 * (Zod) from `@opencode-ai/plugin` as a runtime value — the SDK packages are
 * devDependencies (type-only), and a surviving `import { tool } from
 * '@opencode-ai/plugin'` breaks the published plugin at module-load time when
 * the SDK is absent from the npm install (Node throws `ERR_MODULE_NOT_FOUND`
 * before the `config` hook ever runs). The SDK's `ToolDefinition` type models
 * Zod args, so the returned literal is cast to that type at the single point
 * below; the runtime deliberately accepts the plain-schema shape.
 */
export function createSddCommandTool(deps: SddCommandToolDeps): ToolDefinition {
  const allowset = new Set(ALLOWED_COMMANDS);
  const definition = {
    description: `Load a command's instructions. Available commands: ${AVAILABLE_COMMANDS}.`,
    args: {
      command: {
        type: 'string',
        description: 'Name of the command to load; must be one of: ' + AVAILABLE_COMMANDS + '.',
      },
    },
    async execute(args: SddCommandExecuteArgs): Promise<string> {
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
  };
  // Bridge the SDK's Zod-modeled `ToolDefinition` type to the dependency-free
  // plain-schema shape we ship (see the function docblock for why).
  return definition as unknown as ToolDefinition;
}
