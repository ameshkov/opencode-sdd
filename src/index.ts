import type { Hooks, PluginInput } from '@opencode-ai/plugin';
import type { Plugin } from '@opencode/plugin';
import {
  createV1Hooks,
  createV1Logger,
  createV2Logger,
  isV2Host,
  registerV2,
} from './host/index.js';

/**
 * Shape of the dual plugin entry.
 *
 * A single default export object carries both host entry points:
 *
 * - `server(input)` is called by opencode V1 (1.18.29+ accepts the object form
 *   and dispatches by export name); it returns the V1 `Hooks` object.
 * - `setup(ctx)` is called by opencode V2, whose loader requires an object with
 *   `id` plus `setup`/`effect`; it registers the surface directly.
 *
 * V1 does not call `setup`, and V2 ignores `server`, so one published package
 * serves both hosts.
 */
export interface SddPluginDefinition {
  /** Stable plugin id required by the V2 loader. */
  readonly id: string;
  /**
   * V1 entry point.
   *
   * @param input - V1 plugin input carrying the host client.
   * @returns The V1 hooks (`config` + `tool`).
   */
  server(input: PluginInput): Promise<Hooks>;
  /**
   * V2 entry point.
   *
   * @param ctx - V2 plugin context; ignored when the shape is not a V2 host.
   */
  setup(ctx: Plugin.Context): Promise<void>;
}

/**
 * OpenCode SDD plugin entry point.
 *
 * Loads Markdown command files from the bundled commands directory, rewrites
 * the portable `@opencode-sdd-templates/` token in each template to the
 * resolved absolute templates directory (so opencode natively inlines the
 * bundled asset files via `@<abs-path>` mention resolution), and spread-merges
 * them onto the host config while preserving existing user configuration.
 * SDD agents are registered alongside, and the `sdd-command` tool is gated to
 * the SDD worker agents. Any registration error is logged and swallowed; the
 * plugin never throws during load on either host.
 */
const sddPlugin: SddPluginDefinition = {
  id: 'opencode-sdd',

  async server(input: PluginInput): Promise<Hooks> {
    const logger = createV1Logger(input.client);
    await logger.info('plugin loading');
    return createV1Hooks(logger);
  },

  async setup(ctx: Plugin.Context): Promise<void> {
    // V1 dispatches by export name and never calls setup; the guard protects
    // against any non-V2 context that somehow reaches this path.
    if (!isV2Host(ctx)) {
      return;
    }
    const logger = createV2Logger();
    await logger.info('plugin loading');
    try {
      await registerV2(ctx, logger);
    } catch (error) {
      // Defensive: registration steps already swallow their own errors, but
      // plugin setup must never propagate a failure into the host boot.
      await logger.error('failed to register SDD plugin', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

export default sddPlugin;
