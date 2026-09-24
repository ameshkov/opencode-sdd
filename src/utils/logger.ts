/**
 * Logging port shared by every host adapter.
 *
 * The port is deliberately host-neutral: it names the four levels the SDD
 * registration code uses and nothing else. The V1 adapter forwards entries to
 * opencode's `client.app.log`; the V2 adapter writes them to the console
 * because the V2 `Plugin.Context` exposes no logger.
 *
 * Every method returns a promise so adapters can await a network write (V1)
 * without callers caring whether the implementation is actually async.
 */
export interface Logger {
  /**
   * Log a debug-level message.
   *
   * @param message - Human-readable message.
   * @param extra - Optional structured fields attached to the entry.
   */
  debug(message: string, extra?: Record<string, unknown>): Promise<void>;
  /**
   * Log an info-level message.
   *
   * @param message - Human-readable message.
   * @param extra - Optional structured fields attached to the entry.
   */
  info(message: string, extra?: Record<string, unknown>): Promise<void>;
  /**
   * Log a warning-level message.
   *
   * @param message - Human-readable message.
   * @param extra - Optional structured fields attached to the entry.
   */
  warn(message: string, extra?: Record<string, unknown>): Promise<void>;
  /**
   * Log an error-level message.
   *
   * @param message - Human-readable message.
   * @param extra - Optional structured fields attached to the entry.
   */
  error(message: string, extra?: Record<string, unknown>): Promise<void>;
}
