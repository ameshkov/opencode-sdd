import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

/**
 * The opencode host line a detected binary belongs to.
 *
 * - `v1` — the 1.18.29+ line, where the plugin is a function/object consumed
 *   through the `config` hook.
 * - `v2` — the 2.x line, where the plugin is a `{ id, setup }` object.
 */
export type OpencodeHost = 'v1' | 'v2';

/** Lowest supported V1 release (the first with the object plugin entrypoint). */
const V1_MIN_VERSION = '1.18.29';

/** Successful binary detection with a parsed semantic version. */
export interface DetectOk {
  ok: true;
  /** Raw trimmed `opencode --version` output. */
  raw: string;
  /** Normalized `MAJOR.MINOR.PATCH` (any prerelease/build suffix dropped). */
  version: string;
  major: number;
  minor: number;
  patch: number;
}

/** Why detection failed. */
type DetectFailReason = 'not-found' | 'unparseable';

/** Failed binary detection. */
interface DetectFail {
  ok: false;
  reason: DetectFailReason;
  /** Raw output, when the binary ran but its version could not be parsed. */
  raw?: string;
}

/** Result of probing the `opencode` binary. */
export type DetectResult = DetectOk | DetectFail;

/** Dependency injection for {@link detect}. */
export interface DetectDeps {
  /** Overrides the `opencode --version` invocation (tests). */
  execVersion?: () => string;
}

/** Hint shown when the opencode binary is missing or fails to run. */
export const INSTALL_OPENCODE_HINT =
  'opencode binary not found on PATH or failed to run. Install it ' +
  '(for example `brew install opencode` or `npm install -g opencode-ai`) ' +
  'and re-run `opencode-sdd install`.';

/**
 * Hint shown when the binary ran but printed an unrecognized version.
 *
 * @param raw - Raw `opencode --version` output.
 * @returns A user-facing error message.
 */
export function unparseableVersionHint(raw: string): string {
  return (
    `could not parse the opencode version from \`opencode --version\` output ` +
    `(${JSON.stringify(raw)}). Reinstall opencode and re-run ` +
    '`opencode-sdd install`.'
  );
}

/**
 * Hint shown when the detected opencode release is not supported.
 *
 * @param detected - Parsed detection result.
 * @returns A user-facing error message.
 */
export function unsupportedOpencodeHint(detected: DetectOk): string {
  return (
    `opencode ${detected.version} is not supported: opencode-sdd requires ` +
    `opencode >= ${V1_MIN_VERSION} on the 1.x line or opencode 2.x. ` +
    'Upgrade opencode and re-run `opencode-sdd install`.'
  );
}

/**
 * Parse a semantic version out of `opencode --version` output.
 *
 * Handles the V1 form (`1.18.32`), the V2 form (`opencode v2.0.14`), and any
 * suffix (`1.18.29-beta.1`). The first `MAJOR.MINOR.PATCH` triplet wins.
 *
 * @param raw - Raw command output.
 * @returns Parsed components, or `null` when no version triplet is present.
 * @internal Exported for tests only; not part of the public module API.
 *   Production callers reach it through {@link detect}.
 */
export function parseOpencodeVersion(
  raw: string,
): { version: string; major: number; minor: number; patch: number } | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (match === null) {
    return null;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return { version: `${major}.${minor}.${patch}`, major, minor, patch };
}

/**
 * Decide which host line a detected binary belongs to.
 *
 * `2.x` and newer map to `v2`; `1.x` maps to `v1` only at or above
 * {@link V1_MIN_VERSION}; everything else is unsupported (`null`).
 *
 * @param detected - Parsed detection result.
 * @returns The host line, or `null` when unsupported.
 */
export function resolveHost(detected: DetectOk): OpencodeHost | null {
  if (detected.major >= 2) {
    return 'v2';
  }
  if (detected.major === 1) {
    const atFloor = detected.minor > 18 || (detected.minor === 18 && detected.patch >= 29);
    return atFloor ? 'v1' : null;
  }
  return null;
}

/**
 * Run `opencode --version` and parse the result.
 *
 * Every failure mode (missing binary, non-zero exit, timeout, unparseable
 * output) is returned as a typed failure rather than thrown.
 *
 * @param deps - Optional injection of the version command.
 * @returns The detection result.
 */
export function detect(deps: DetectDeps = {}): DetectResult {
  const execVersion = deps.execVersion ?? defaultExecVersion;
  let raw: string;
  try {
    raw = execVersion().trim();
  } catch {
    return { ok: false, reason: 'not-found' };
  }
  const parsed = parseOpencodeVersion(raw);
  if (parsed === null) {
    return { ok: false, reason: 'unparseable', raw };
  }
  return { ok: true, raw, ...parsed };
}

/**
 * Default version probe: `opencode --version` on PATH.
 *
 * @returns Raw stdout.
 */
function defaultExecVersion(): string {
  return execFileSync('opencode', ['--version'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: platform() === 'win32',
    encoding: 'utf8',
    timeout: 10_000,
  });
}
