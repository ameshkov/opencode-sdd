import type { Plugin } from '@opencode/plugin';

/**
 * Null-safe capability check for the opencode V2 plugin host.
 *
 * V1 dispatches by export name: it calls `server()` on a dual entry and never
 * calls `setup()`. This guard is therefore not load-bearing on V1 1.18.x; it
 * exists so a non-V2 object that somehow reaches `setup` (an older V1 host
 * that probes for a `setup` key, a test double, a future host) is ignored
 * instead of throwing mid-registration.
 *
 * Detection is capability-based rather than version-based because the context
 * carries no version. The required capabilities are exactly the three editor
 * transforms the V2 adapter registers through:
 * `agent.transform`, `command.transform`, and `tool.transform`.
 *
 * @param ctx - Candidate plugin context of unknown shape.
 * @returns `true` when `ctx` exposes the V2 editor transforms.
 */
export function isV2Host(ctx: unknown): ctx is Plugin.Context {
  if (ctx === null || typeof ctx !== 'object') {
    return false;
  }
  const candidate = ctx as {
    agent?: { transform?: unknown };
    command?: { transform?: unknown };
    tool?: { transform?: unknown };
  };
  return (
    typeof candidate.agent?.transform === 'function' &&
    typeof candidate.command?.transform === 'function' &&
    typeof candidate.tool?.transform === 'function'
  );
}
