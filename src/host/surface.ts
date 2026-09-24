import type { AgentConfig } from '@opencode-ai/sdk';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgents } from '../agents/index.js';
import { loadCommands, type CommandConfig } from '../commands/index.js';
import { createSddCommandToolCore, type SddCommandToolCore } from '../sdd-command/index.js';
import type { Logger } from '../utils/index.js';

/**
 * Absolute directories the SDD surface is loaded from.
 *
 * `commands` and `templates` are consumed by the registration code; `agents`
 * is kept for observability and symmetry.
 */
interface SurfaceDirs {
  readonly commands: string;
  readonly templates: string;
  readonly agents: string;
}

/**
 * The host-neutral SDD surface: resolved directories, the loaded command and
 * agent definitions, and the neutral `sdd-command` tool core.
 *
 * Built by {@link buildSurface} on every V1 `config` hook invocation (so
 * per-invocation environment overrides keep working) and once per location
 * boot by the V2 `setup` path.
 */
export interface Surface {
  readonly dirs: SurfaceDirs;
  readonly commands: ReadonlyMap<string, CommandConfig>;
  readonly agents: ReadonlyMap<string, AgentConfig>;
  readonly tool: SddCommandToolCore;
}

/**
 * Bundled commands directory, resolved relative to this module.
 *
 * This file compiles to `build/host/surface.js`, so `..` lands on `build/`
 * where `scripts/copy-assets.mjs` places the bundled `assets/` tree.
 */
const BUNDLED_COMMANDS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'commands',
);

/**
 * Bundled template assets directory, resolved relative to this module.
 *
 * See {@link BUNDLED_COMMANDS_DIR} for the path reasoning.
 */
const BUNDLED_TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'commands',
  'templates',
);

/**
 * Bundled agents directory, resolved relative to this module.
 *
 * See {@link BUNDLED_COMMANDS_DIR} for the path reasoning.
 */
const BUNDLED_AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'agents');

/**
 * Resolve the commands directory to load from for the current invocation.
 *
 * Reads `SDD_COMMANDS_DIR` **on every call** so per-test environment-variable
 * overrides take effect. When unset, falls back to the bundled directory.
 *
 * @returns Absolute path to the commands directory to load from.
 */
function resolveCommandsDir(): string {
  return process.env['SDD_COMMANDS_DIR'] ?? BUNDLED_COMMANDS_DIR;
}

/**
 * Resolve the template assets directory for the current invocation.
 *
 * Reads `SDD_TEMPLATES_DIR` **on every call** so per-test environment-variable
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
 * Reads `SDD_AGENTS_DIR` **on every call** so per-test environment-variable
 * overrides take effect.
 *
 * @returns Absolute path to the agents directory.
 */
function resolveAgentsDir(): string {
  return process.env['SDD_AGENTS_DIR'] ?? BUNDLED_AGENTS_DIR;
}

/**
 * Resolve all three bundled directories for the current invocation.
 *
 * @returns The resolved directories.
 */
function resolveSurfaceDirs(): SurfaceDirs {
  return {
    commands: resolveCommandsDir(),
    templates: resolveTemplatesDir(),
    agents: resolveAgentsDir(),
  };
}

/**
 * Create the neutral `sdd-command` tool core with the standard directory
 * resolvers.
 *
 * The resolvers are passed as callbacks (not resolved paths) so environment
 * overrides are honored at tool-call time.
 *
 * @returns A fresh {@link SddCommandToolCore}.
 */
export function createToolCore(): SddCommandToolCore {
  return createSddCommandToolCore({
    resolveCommandsDir,
    resolveTemplatesDir,
  });
}

/**
 * Load the complete SDD surface for the current invocation.
 *
 * Resolves directories, loads the bundled command and agent Markdown, and
 * builds the tool core. The loaders never throw; unreadable or malformed
 * assets are logged and skipped.
 *
 * @param logger - Logger port for loader diagnostics.
 * @returns The loaded {@link Surface}.
 */
export async function buildSurface(logger: Logger): Promise<Surface> {
  const dirs = resolveSurfaceDirs();
  const [commands, agents] = await Promise.all([
    loadCommands(dirs.commands, logger),
    loadAgents(dirs.agents, logger),
  ]);
  return { dirs, commands, agents, tool: createToolCore() };
}
