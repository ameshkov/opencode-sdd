import type { Logger } from '../../utils/index.js';

/** Prefix on every line so SDD output is greppable in host logs. */
const PREFIX = 'opencode-sdd';

/**
 * Render the optional structured fields as a compact suffix.
 *
 * @param extra - Structured fields attached to the entry.
 * @returns An empty string when absent, otherwise ` <json>`.
 */
function formatExtra(extra?: Record<string, unknown>): string {
  if (extra === undefined) {
    return '';
  }
  try {
    return ` ${JSON.stringify(extra)}`;
  } catch {
    return ' [unserializable extra]';
  }
}

/**
 * Create the V2 {@link Logger} adapter.
 *
 * The V2 `Plugin.Context` exposes `app` (`{ name, version, channel }`) but no
 * logger, so entries go to **stderr**. That is deliberate: in V2's
 * `serve --stdio` mode (the mode the CLI uses to host a session) the server
 * owns stdout as its RPC channel, so plugin `console.log` output is swallowed.
 * The host forwards stderr to its own logs, which is what makes the e2e loader
 * smoke able to assert registration lines from the real V2 binary.
 *
 * Every level writes through `console.error` because only stderr survives the
 * stdio transport; the level is carried in the line itself.
 *
 * @returns A logger that writes prefixed lines to stderr.
 */
export function createV2Logger(): Logger {
  const write = async (level: string, message: string, extra?: Record<string, unknown>) => {
    console.error(`${PREFIX}: ${level}: ${message}${formatExtra(extra)}`);
  };
  return {
    debug: (message, extra) => write('debug', message, extra),
    info: (message, extra) => write('info', message, extra),
    warn: (message, extra) => write('warn', message, extra),
    error: (message, extra) => write('error', message, extra),
  };
}
