import type { AgentConfig } from '@opencode-ai/sdk';
import type { Plugin } from '@opencode/plugin';
import type { Logger } from '../../utils/index.js';
import {
  hasRule,
  mapPermissionMap,
  mergeRules,
  sddCommandDenyRule,
  withTemplatesGrant,
  type V2PermissionRule,
} from './permissions.js';

/**
 * Mutable subset of a V2 `Agent.Info` the SDD adapter writes.
 *
 * Declared structurally so the adapter does not depend on the SDK's
 * `DeepMutable` helper (not exported from the plugin package root).
 */
interface MutableAgentInfo {
  description?: string;
  mode: 'subagent' | 'primary' | 'all';
  system?: string;
  permissions: V2PermissionRule[];
}

/**
 * Apply one SDD agent definition onto a mutable V2 `Agent.Info`.
 *
 * The V1 `prompt` field maps to V2 `system`; the parsed `permission` map is
 * mapped onto V2 rules and appended to the agent's existing ruleset so plugin
 * rules win under last-match-wins evaluation while built-in defaults remain
 * for anything the plugin does not define. The bundled-templates
 * `external_directory` grant is added to every SDD agent because any of them
 * may read a template file through the `read` tool.
 *
 * The frontmatter `hidden` flag is intentionally not mapped. V2's `subagent`
 * tool filters hidden agents out of the catalog it shows the model (verified
 * against 2.0.14), which would make the SDD workers undispatchable; the
 * `mode: 'subagent'` mapping already keeps them out of primary/default agent
 * selection, and a user who wants them hidden can still say so in the host
 * config (the config-agent plugin applies it after this adapter).
 *
 * @param agent - Mutable agent info to update.
 * @param config - Loaded SDD agent config.
 * @param templatesDir - Absolute bundled templates directory.
 */
function applySddAgent(agent: MutableAgentInfo, config: AgentConfig, templatesDir: string): void {
  if (config.description !== undefined) {
    agent.description = config.description;
  }
  if (config.mode !== undefined) {
    agent.mode = config.mode;
  }
  if (config.prompt !== undefined) {
    agent.system = config.prompt;
  }
  const mapped = withTemplatesGrant(mapPermissionMap(config.permission), templatesDir);
  agent.permissions = mergeRules(agent.permissions, mapped);
}

/**
 * Register the SDD agents on a V2 host.
 *
 * `AgentEditor.update(missingId)` creates the agent, so one call handles both
 * creation and merge. Non-SDD agents receive the global `sdd-command` deny
 * rule unless they already carry a user-set `sdd-command` rule, which is the
 * V2 equivalent of V1's global `permission['sdd-command'] = 'deny'`. Any
 * error is logged and swallowed so setup never throws.
 *
 * @param ctx - V2 plugin context.
 * @param agents - Loaded SDD agent configs keyed by name.
 * @param templatesDir - Absolute bundled templates directory.
 * @param logger - Logger port.
 */
export async function registerV2Agents(
  ctx: Plugin.Context,
  agents: ReadonlyMap<string, AgentConfig>,
  templatesDir: string,
  logger: Logger,
): Promise<void> {
  try {
    await logger.info('registering SDD agents on opencode v2');

    await ctx.agent.transform((editor) => {
      for (const [name, config] of agents) {
        editor.update(name, (agent) => {
          applySddAgent(agent as unknown as MutableAgentInfo, config, templatesDir);
        });
      }

      for (const agent of editor.list()) {
        // `DeepMutable<Agent.ID>` degrades a branded string to a structural
        // object; the runtime value is still the plain id string.
        const id = String(agent.id);
        if (agents.has(id) || hasRule(agent.permissions, 'sdd-command')) {
          continue;
        }
        editor.update(id, (current) => {
          current.permissions = [...current.permissions, sddCommandDenyRule()];
        });
      }
    });

    await logger.info('SDD agents registered', { count: agents.size });
  } catch (error) {
    await logger.error('failed to register SDD agents', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
