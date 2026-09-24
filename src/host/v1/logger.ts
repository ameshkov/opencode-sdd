import type { OpencodeClient } from '@opencode-ai/sdk';
import type { Logger } from '../../utils/index.js';

/** Log levels accepted by opencode's `client.app.log` endpoint. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Service name reported on every log entry. */
const SERVICE = 'opencode-sdd';

/**
 * Write one entry to opencode's logger.
 *
 * Failures are swallowed: logging must never break plugin startup or hook
 * execution. `extra` is omitted entirely (rather than sent as `undefined`)
 * when absent, matching opencode's payload expectations.
 */
async function write(
  client: OpencodeClient,
  level: LogLevel,
  message: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    await client.app.log({
      body: {
        service: SERVICE,
        level,
        message,
        ...(extra === undefined ? {} : { extra }),
      },
    });
  } catch {
    // Logging must never break plugin startup or hook execution.
  }
}

/**
 * Create the V1 {@link Logger} adapter backed by opencode's `client.app.log`.
 *
 * @param client - opencode V1 client supplied in `PluginInput`.
 * @returns A logger that forwards every entry to the host.
 */
export function createV1Logger(client: OpencodeClient): Logger {
  return {
    debug: (message, extra) => write(client, 'debug', message, extra),
    info: (message, extra) => write(client, 'info', message, extra),
    warn: (message, extra) => write(client, 'warn', message, extra),
    error: (message, extra) => write(client, 'error', message, extra),
  };
}
