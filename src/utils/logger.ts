import type { OpencodeClient } from '@opencode-ai/sdk';

/** Severity levels accepted by opencode's structured logging API. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured metadata attached to a log entry.
 *
 * Forwarded to opencode as the `extra` field of the log request.
 */
type LogExtra = Record<string, unknown>;

/**
 * Plugin logger. Each method writes a structured log entry to opencode's
 * server logs through the SDK client (`client.app.log`) and resolves once the
 * entry has been submitted.
 *
 * Submission failures are swallowed so that logging never breaks plugin
 * startup or hook execution, per the requirement that the plugin must not
 * throw during load.
 */
export interface Logger {
  /** Writes a debug-level entry. */
  debug(message: string, extra?: LogExtra): Promise<void>;
  /** Writes an info-level entry. */
  info(message: string, extra?: LogExtra): Promise<void>;
  /** Writes a warning-level entry. */
  warn(message: string, extra?: LogExtra): Promise<void>;
  /** Writes an error-level entry. */
  error(message: string, extra?: LogExtra): Promise<void>;
}

/** Service name used to attribute every log entry to this plugin. */
const SERVICE = 'opencode-sdd';

/**
 * Submits a single log entry via the opencode SDK client.
 *
 * Any rejection from `client.app.log` is swallowed so logging can never cause
 * the plugin to throw.
 *
 * @param client - opencode SDK client obtained from the plugin input.
 * @param level - Severity of the entry.
 * @param message - Human-readable message.
 * @param extra - Optional structured metadata.
 */
async function write(
  client: OpencodeClient,
  level: LogLevel,
  message: string,
  extra?: LogExtra,
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
 * Creates a {@link Logger} backed by opencode's structured logging API.
 *
 * @param client - opencode SDK client from the plugin input.
 * @returns A logger whose methods submit entries through `client.app.log`.
 */
export function createLogger(client: OpencodeClient): Logger {
  return {
    debug: (message, extra) => write(client, 'debug', message, extra),
    info: (message, extra) => write(client, 'info', message, extra),
    warn: (message, extra) => write(client, 'warn', message, extra),
    error: (message, extra) => write(client, 'error', message, extra),
  };
}
