import { AVAILABLE_COMMANDS, ALLOWED_COMMANDS, formatCommandError } from './allowlist.js';
import { loadCommandSource } from './source-loader.js';
import { rewriteAssetReferences } from '../utils/index.js';

/**
 * Dependencies of the neutral `sdd-command` tool core.
 *
 * Both are resolvers rather than resolved paths so environment overrides
 * (`SDD_COMMANDS_DIR`, `SDD_TEMPLATES_DIR`) are read on every tool call, not
 * captured at factory time.
 */
export interface SddCommandToolCoreDeps {
  /** Returns the absolute commands directory to read `<name>.md` from. */
  resolveCommandsDir(): string;
  /** Returns the absolute templates directory used to rewrite the token. */
  resolveTemplatesDir(): string;
}

/** A single legacy V1 tool argument descriptor. */
interface SddCommandLegacyArg {
  readonly type: 'string';
  readonly description: string;
}

/**
 * Host-neutral `sdd-command` tool definition.
 *
 * The core owns everything that does not depend on the host plugin API: the
 * tool description, the input schema (in both the legacy V1 args-fragment form
 * and the full JSON Schema form V2 expects), and the execution behavior. Host
 * adapters wrap it into their native `ToolDefinition` shape.
 */
export interface SddCommandToolCore {
  /** Human-readable tool description shown to the model. */
  readonly description: string;
  /**
   * Full JSON Schema for the tool input, used by the V2 adapter.
   *
   * Plain JSON Schema (not Zod) is deliberate: importing `tool.schema` from
   * the plugin package as a value would break the published plugin at module
   * load with `ERR_MODULE_NOT_FOUND` (see the V1 adapter docblock).
   */
  readonly inputSchema: Record<string, unknown>;
  /**
   * Legacy V1 args fragment keyed by argument name, used by the V1 adapter.
   *
   * opencode V1 duck-types the args value and falls back to its
   * `legacyJsonSchema` handling for plain objects.
   */
  readonly legacyArgs: Record<string, SddCommandLegacyArg>;
  /**
   * Load a command's Markdown source and return it as tool output.
   *
   * Never throws: every failure (empty, not allowlisted, missing, unreadable)
   * is rendered as a single-line error string via `formatCommandError`.
   *
   * @param input - Raw tool input; only `{ command: string }` is meaningful.
   * @returns The command instructions prefixed with a `Loaded command ...`
   *   header, or an error string for an invalid request.
   */
  execute(input: unknown): Promise<string>;
}

/** Argument name of the single `sdd-command` tool input. */
const COMMAND_ARG = 'command';

/**
 * Create the host-neutral `sdd-command` tool core.
 *
 * @param deps - Directory resolvers read on every `execute` call.
 * @returns The neutral core consumed by the V1 and V2 host adapters.
 */
export function createSddCommandToolCore(deps: SddCommandToolCoreDeps): SddCommandToolCore {
  const allowset = new Set(ALLOWED_COMMANDS);
  const description = `Load a command's instructions. Available commands: ${AVAILABLE_COMMANDS}.`;
  const commandDescription =
    'Name of the command to load; must be one of: ' + AVAILABLE_COMMANDS + '.';

  return {
    description,
    inputSchema: {
      type: 'object',
      properties: {
        [COMMAND_ARG]: { type: 'string', description: commandDescription },
      },
      required: [COMMAND_ARG],
      additionalProperties: false,
    },
    legacyArgs: {
      [COMMAND_ARG]: { type: 'string', description: commandDescription },
    },
    async execute(input: unknown): Promise<string> {
      const requested =
        input !== null && typeof input === 'object'
          ? (input as Record<string, unknown>)[COMMAND_ARG]
          : undefined;
      if (typeof requested !== 'string' || requested === '') {
        return formatCommandError(String(requested ?? ''), 'empty');
      }
      if (!allowset.has(requested)) {
        return formatCommandError(requested, 'not-allowed');
      }
      const result = await loadCommandSource(requested, deps.resolveCommandsDir());
      if (!result.ok) {
        return formatCommandError(requested, result.reason);
      }
      const templatesDir = deps.resolveTemplatesDir();
      const rewritten = rewriteAssetReferences(result.body, templatesDir);
      return `Loaded command "${requested}" from ${result.absPath}.\n\n${rewritten}`;
    },
  };
}
