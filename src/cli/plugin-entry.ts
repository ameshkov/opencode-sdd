import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { OwnPackageInfo } from './own-package.js';

/**
 * The bare plugin entry written by the install CLI by default. opencode
 * resolves it to the npm `latest` dist-tag of `opencode-sdd` at startup.
 *
 * @internal Exported for tests only; not part of the public module API.
 */
export const BARE_PLUGIN_ENTRY = 'opencode-sdd';

/**
 * The dist-tag pinned into the config when the running install CLI is a
 * prerelease build — the tag the CI canary job publishes under. Never
 * the `latest` tag: prerelease builds self-pin so opencode loads what
 * the user actually installed.
 *
 * @internal Exported for tests only; not part of the public module API.
 */
export const CANARY_TAG = 'canary';

/** Valid `--tag` values: npm dist-tag or SemVer (letters, digits, `._-`). */
const SPEC_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Action {@link planPluginEntry} chooses for the existing plugin array. */
export type PluginEntryAction = 'noop' | 'add' | 'replace' | 'keep-existing';

/** Inputs to {@link resolvePluginEntry}. */
export interface PluginEntryRequest {
  /** Value of `--tag` (npm dist-tag or version), if given. */
  readonly tag?: string;
  /** `true` when `--local` was given. */
  readonly local?: boolean;
  /** Value of `--local <path>`, if given. */
  readonly localPath?: string;
  /** Working directory, used to resolve a relative `--local` path. */
  readonly cwd: string;
  /**
   * The running package's own facts (see {@link readOwnPackage}).
   * `null` when the package could not be located (falls back to the
   * bare entry).
   */
  readonly own: OwnPackageInfo | null;
}

/** The resolved plugin entry to write into the config. */
export interface PluginEntryResolution {
  /**
   * The config string, one of `opencode-sdd`, `opencode-sdd@<spec>`, or
   * `file://<abs-path>`.
   */
  readonly entry: string;
  /**
   * `true` when the entry came from an explicit CLI flag (`--tag` /
   * `--local`) — an explicit entry REPLACES an existing opencode-sdd
   * reference; the automatic default only upgrades a bare `opencode-sdd`
   * reference and never yanks a pinned one.
   */
  readonly explicit: boolean;
}

/**
 * Format an npm dist-tag/version pin. opencode resolves non-local
 * plugin entries with `npm-package-arg`, where the `name@spec` form is
 * a registry spec (`type: 'tag'`/`'range'`); the `npm:` prefix — used
 * only as an alias target — is NOT a valid registry spec.
 *
 * @param spec - a dist-tag or SemVer (e.g. `canary`, `latest`, `1.2.0`).
 * @internal Exported for tests only; not part of the public module API.
 */
export function npmConfigEntry(spec: string): string {
  return `${BARE_PLUGIN_ENTRY}@${spec}`;
}

/**
 * Format a local build's plugin entry. opencode loads `file://` entries
 * by resolving the package's `main`/`exports` (`build/index.js`), so
 * the path must point at the package ROOT (the directory containing
 * `package.json`), not at `build/`.
 *
 * @param absPath - the local plugin package root; made absolute against
 *                  the process cwd, then URL-encoded (`pathToFileURL`).
 * @internal Exported for tests only; not part of the public module API.
 */
export function fileConfigEntry(absPath: string): string {
  return pathToFileURL(resolve(absPath)).href;
}

/**
 * `true` when a config plugin entry references the opencode-sdd
 * package in a form the installer recognizes: the bare name, an npm
 * `name@spec` pin, or the (non-functional, hand-written) `npm:`-prefixed
 * alias form — the latter is recognized so a broken entry is never
 * duplicated beside a working one.
 */
export function isOpenCodeSddReference(entry: string): boolean {
  if (entry === BARE_PLUGIN_ENTRY) {
    return true;
  }
  if (entry.startsWith(`${BARE_PLUGIN_ENTRY}@`)) {
    return true;
  }
  const npmPrefixed = `npm:${BARE_PLUGIN_ENTRY}`;
  return entry === npmPrefixed || entry.startsWith(`${npmPrefixed}@`);
}

/**
 * Decide what to do with the existing `plugin` array given the desired
 * entry. Idempotency is exact-string (never re-formats a matching
 * entry); a non-matching existing opencode-sdd reference is REPLACED
 * when the request is explicit, upgraded when the existing reference is
 * the bare `opencode-sdd` and the auto default is a pin, and otherwise
 * KEPT with a note (never silently downgrade a pinned config).
 *
 * @param existing - the current `plugin` array values.
 * @param desired - the entry the installer wants to write.
 * @param explicit - whether `desired` came from an explicit CLI flag.
 */
export function planPluginEntry(
  existing: readonly string[],
  desired: string,
  explicit: boolean,
): PluginEntryAction {
  if (existing.includes(desired)) {
    return 'noop';
  }
  const references = existing.filter(isOpenCodeSddReference);
  if (references.length === 0) {
    return 'add';
  }
  if (references.length > 1) {
    // Multiple opencode-sdd references are ambiguous (accumulated or
    // hand-edited) — never guess which one to replace.
    return 'keep-existing';
  }
  if (explicit) {
    return 'replace';
  }
  const existingReference = existing.find(isOpenCodeSddReference);
  return existingReference === BARE_PLUGIN_ENTRY ? 'replace' : 'keep-existing';
}

/**
 * Resolve the plugin entry the installer should write. Precedence:
 * `--local` > `--tag` > build-aware default (prerelease build pins the
 * `canary` dist-tag; release builds keep the bare `latest` entry).
 *
 * @throws Error on `--local` without a resolvable path (no explicit
 *               path and the running package could not be located) or
 *               an invalid `--tag` value.
 */
export function resolvePluginEntry(request: PluginEntryRequest): PluginEntryResolution {
  const { tag, local, localPath, cwd, own } = request;
  if (tag !== undefined && local) {
    throw new Error('--tag and --local cannot be combined');
  }
  if (local) {
    if (localPath !== undefined) {
      return { entry: fileConfigEntry(resolve(cwd, localPath)), explicit: true };
    }
    if (own !== null) {
      return { entry: fileConfigEntry(own.root), explicit: true };
    }
    throw new Error(
      '--local requires a path when the running opencode-sdd package cannot be located',
    );
  }
  if (tag !== undefined) {
    if (!SPEC_PATTERN.test(tag)) {
      throw new Error(
        `invalid --tag value "${tag}" (expected a dist-tag or version, e.g. canary, latest, 1.2.0)`,
      );
    }
    return { entry: npmConfigEntry(tag), explicit: true };
  }
  if (own !== null && own.prerelease) {
    return { entry: npmConfigEntry(CANARY_TAG), explicit: false };
  }
  return { entry: BARE_PLUGIN_ENTRY, explicit: false };
}
