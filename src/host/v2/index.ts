import type { Plugin } from '@opencode/plugin';
import type { Logger } from '../../utils/index.js';
import { buildSurface } from '../surface.js';
import { registerV2Agents } from './agents.js';
import { registerV2Commands } from './commands.js';
import { registerV2Tool } from './tool.js';

/**
 * Register the complete SDD surface on an opencode V2 host.
 *
 * Builds the host-neutral surface once per location boot (V2 loads plugins
 * when a location/instance starts, not when `serve` starts) and registers
 * agents, commands, and the `sdd-command` tool. Each registration step catches
 * its own errors; this function never throws, so plugin setup can never break
 * a host boot.
 *
 * @param ctx - V2 plugin context from `setup(ctx)`.
 * @param logger - V2 logger adapter.
 */
export async function registerV2(ctx: Plugin.Context, logger: Logger): Promise<void> {
  const surface = await buildSurface(logger);
  await registerV2Agents(ctx, surface.agents, surface.dirs.templates, logger);
  await registerV2Commands(ctx, surface.commands, surface.dirs.templates, logger);
  await registerV2Tool(ctx, surface.tool, logger);
}
