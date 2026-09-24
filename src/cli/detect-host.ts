import {
  INSTALL_OPENCODE_HINT,
  resolveHost,
  unparseableVersionHint,
  unsupportedOpencodeHint,
  type DetectResult,
  type OpencodeHost,
} from './prerequisites.js';

/** A successful host resolution. */
interface HostDetected {
  ok: true;
  /** Detected host line. */
  host: OpencodeHost;
  /** Normalized detected version. */
  version: string;
}

/** A failed detection, with a user-facing message. */
interface HostDetectFailed {
  ok: false;
  /** Message to print to stderr. */
  message: string;
}

/** Result of {@link detectHost}. */
export type HostDetectResult = HostDetected | HostDetectFailed;

/**
 * Detect the opencode binary, enforce the supported-version floor, and
 * resolve the host line.
 *
 * @param detectOpencode - Detection function (injectable for tests).
 * @returns The host line plus version, or a user-facing error message.
 */
export function detectHost(detectOpencode: () => DetectResult): HostDetectResult {
  const detected = detectOpencode();
  if (!detected.ok) {
    return {
      ok: false,
      message:
        detected.reason === 'unparseable'
          ? unparseableVersionHint(detected.raw ?? '')
          : INSTALL_OPENCODE_HINT,
    };
  }
  const host = resolveHost(detected);
  if (host === null) {
    return { ok: false, message: unsupportedOpencodeHint(detected) };
  }
  return { ok: true, host, version: detected.version };
}
