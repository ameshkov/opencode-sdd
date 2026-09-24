/**
 * V2 permission mapping.
 *
 * opencode V2 models agent permissions as an ordered ruleset of
 * `{ action, resource, effect }` rules evaluated last-match-wins
 * (`Permission.evaluate` in `@opencode/core`): the *last* rule matching both
 * action and resource decides. The plugin therefore expresses its V1
 * per-agent `permission` maps by appending mapped rules to each agent, and
 * expresses the V1 global `sdd-command` deny by appending a deny rule to
 * every non-SDD agent that does not already carry a user-set rule.
 *
 * Tool visibility is decided by the same ruleset: the tool snapshot excludes
 * any tool whose effective rule is `{ resource: "*", effect: "deny" }`
 * (`whollyDisabled` in `@opencode/core`). Appending the deny rule is
 * therefore what hides `sdd-command` from non-SDD agents, matching the V1
 * global `permission['sdd-command'] = 'deny'`.
 */

/** A V2 permission effect. */
type V2PermissionEffect = 'allow' | 'deny' | 'ask';

/** A single V2 agent permission rule. */
export interface V2PermissionRule {
  readonly action: string;
  readonly resource: string;
  readonly effect: V2PermissionEffect;
}

/** V1 permission category names that map to differently-named V2 actions. */
const ACTION_ALIASES: Readonly<Record<string, string>> = {
  bash: 'shell',
  task: 'subagent',
};

/** Effects accepted by the V2 permission schema. */
const EFFECTS = new Set<string>(['allow', 'deny', 'ask']);

/** The `sdd-command` permission action. */
export const SDD_COMMAND_PERMISSION = 'sdd-command';

/**
 * Map a parsed V1 agent `permission` map onto V2 permission rules.
 *
 * Values may be a single effect (`read: allow`) or a resource map
 * (`task: { "*": deny, sdd-explore: allow }`). Invalid entries are skipped;
 * the frontmatter parser already validated the YAML shape, and a malformed
 * rule must never break registration. V1 `bash`/`task` actions are aliased to
 * their V2 names (`shell`/`subagent`).
 *
 * @param permission - Parsed permission map from agent frontmatter.
 * @returns Ordered V2 rules, preserving the map's insertion order.
 */
export function mapPermissionMap(permission: unknown): V2PermissionRule[] {
  if (permission === null || typeof permission !== 'object') {
    return [];
  }
  const rules: V2PermissionRule[] = [];
  for (const [rawAction, value] of Object.entries(permission as Record<string, unknown>)) {
    const action = ACTION_ALIASES[rawAction] ?? rawAction;
    if (typeof value === 'string') {
      if (EFFECTS.has(value)) {
        rules.push({ action, resource: '*', effect: value as V2PermissionEffect });
      }
      continue;
    }
    if (value !== null && typeof value === 'object') {
      for (const [resource, effect] of Object.entries(value as Record<string, unknown>)) {
        if (typeof effect === 'string' && EFFECTS.has(effect)) {
          rules.push({ action, resource, effect: effect as V2PermissionEffect });
        }
      }
    }
  }
  return rules;
}

/**
 * Merge `added` rules into `existing` so the added rules win under
 * last-match-wins evaluation without accumulating duplicates across reloads.
 *
 * Existing rules with the same `action` and `resource` as an added rule are
 * dropped, then the added rules are appended.
 *
 * @param existing - Rules already on the agent (built-ins, user config).
 * @param added - Rules the plugin defines.
 * @returns The merged ruleset.
 */
export function mergeRules(
  existing: readonly V2PermissionRule[],
  added: readonly V2PermissionRule[],
): V2PermissionRule[] {
  const overridden = new Set(added.map((rule) => `${rule.action}\u0000${rule.resource}`));
  return [
    ...existing.filter((rule) => !overridden.has(`${rule.action}\u0000${rule.resource}`)),
    ...added,
  ];
}

/**
 * Whether a ruleset already contains a rule for `action`.
 *
 * Used to respect a user-set `sdd-command` rule instead of clobbering it,
 * mirroring the V1 global-deny behavior.
 *
 * @param rules - Ruleset to inspect.
 * @param action - Action name to look for.
 * @returns `true` when any rule targets `action`.
 */
export function hasRule(rules: readonly V2PermissionRule[], action: string): boolean {
  return rules.some((rule) => rule.action === action);
}

/**
 * Build the global `sdd-command` deny rule for non-SDD agents.
 *
 * @returns A `{ resource: "*", effect: "deny" }` rule that also excludes the
 *   tool from the agent's snapshot.
 */
export function sddCommandDenyRule(): V2PermissionRule {
  return { action: SDD_COMMAND_PERMISSION, resource: '*', effect: 'deny' };
}

/**
 * Append the bundled-templates `external_directory` grant to a ruleset.
 *
 * The grant mirrors the V1 `config.permission.external_directory` rule. V2
 * reports an external file's resource as `<dirname>/*`, and its wildcard
 * matcher lets `*` cross `/`, so `<templatesDir>/*` covers every nested
 * template file.
 *
 * @param rules - Ruleset to extend.
 * @param templatesDir - Absolute bundled templates directory.
 * @returns The ruleset with the grant appended.
 */
export function withTemplatesGrant(
  rules: readonly V2PermissionRule[],
  templatesDir: string,
): V2PermissionRule[] {
  return [
    ...rules,
    { action: 'external_directory', resource: `${templatesDir}/*`, effect: 'allow' },
  ];
}
