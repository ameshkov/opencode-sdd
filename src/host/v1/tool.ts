import type { ToolDefinition } from '@opencode-ai/plugin';
import type { SddCommandToolCore } from '../../sdd-command/index.js';

/**
 * Wrap the neutral `sdd-command` core into opencode V1's `ToolDefinition`.
 *
 * The `args` fragment is a **plain JSON Schema object**, deliberately not Zod:
 * importing `tool.schema` from `@opencode-ai/plugin` as a value would make the
 * published plugin fail at module load with `ERR_MODULE_NOT_FOUND`, because
 * the package is a type-only devDependency erased at compile time. opencode's
 * `fromPlugin` duck-types `"_zod" in value` and falls back to its
 * `legacyJsonSchema` handling for plain objects, so the fragment works as-is.
 *
 * The single cast bridges the SDK's Zod-modelled `ToolDefinition` type to the
 * dependency-free plain-schema shape we ship.
 *
 * @param core - Neutral tool core with description, legacy args, and execute.
 * @returns The V1 tool definition registered under the `tool` hook.
 */
export function createV1Tool(core: SddCommandToolCore): ToolDefinition {
  const definition = {
    description: core.description,
    args: core.legacyArgs,
    async execute(args: { command?: unknown }): Promise<string> {
      return core.execute(args);
    },
  };
  return definition as unknown as ToolDefinition;
}
