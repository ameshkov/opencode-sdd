import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Prerequisites check succeeded: the `opencode` binary was found on PATH
 * and `--version` exited cleanly; `version` is the trimmed stdout.
 *
 * @internal Exported for tests and the parent discriminated-union type;
 *           not directly importable from a barrel.
 */
export interface DetectOk {
  ok: true;
  version: string;
}

/**
 * Prerequisites check failed: the `opencode` binary is missing or
 * unspawnable. The caller maps this to {@link INSTALL_OPENCODE_HINT}
 * and a non-zero exit.
 *
 * @internal Exported for tests and the parent discriminated-union type;
 *           not directly importable from a barrel.
 */
export interface DetectFail {
  ok: false;
}

/**
 * Discriminated result of {@link detect}: success carries the detected
 * version, failure carries no payload (the hint message is exported
 * separately as {@link INSTALL_OPENCODE_HINT}).
 */
export type DetectResult = DetectOk | DetectFail;

/**
 * Hint printed when the opencode binary is missing or unspawnable, so
 * the user knows to install opencode before re-running the wizard.
 * Mirrors the harness's `requireOpencodeBinary` error.
 */
export const INSTALL_OPENCODE_HINT =
  'opencode binary not found on PATH or failed to run. Install it ' +
  '(for example `brew install opencode` or `npm install -g opencode-ai`) ' +
  'and re-run `opencode-sdd install`.';

interface DetectDeps {
  /**
   * Override the version-probe call (used by tests). Defaults to the
   * real `node:child_process` binding against `opencode --version`.
   */
  execVersion?: () => string;
}

/**
 * Detect the `opencode` binary on PATH. Returns `{ ok: true, version }`
 * on success or `{ ok: false }` when the binary is missing, unspawnable,
 * or hangs past the probe timeout. On Windows the spawn routes through a
 * shell so the `.cmd` shim works; the argument is a fixed literal, so
 * there is no shell-injection surface. The probe is bounded by a 10 s
 * timeout so a stuck binary falls through to `{ ok: false }` (->
 * `INSTALL_OPENCODE_HINT` + non-zero exit) rather than hanging the CLI
 * indefinitely.
 */
export function detect(deps: DetectDeps = {}): DetectResult {
  const execVersion = deps.execVersion ?? defaultExecVersion;
  try {
    const version = execVersion();
    return { ok: true, version: version.trim() };
  } catch {
    // Covers ENOENT, non-zero exit, and the 10 s timeout (execFileSync
    // throws on all three) so every failure mode reaches { ok: false }
    // -> INSTALL_OPENCODE_HINT + non-zero exit, never a hang.
    return { ok: false };
  }
}

/** Default `opencode --version` probe via the real `node:child_process`. */
function defaultExecVersion(): string {
  return execFileSync('opencode', ['--version'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: platform() === 'win32',
    encoding: 'utf8',
    // Bound the probe so a hung/corrupted binary surfaces a diagnostic
    // and falls through to { ok: false } within a human-noticeable window.
    timeout: 10_000,
  });
}
