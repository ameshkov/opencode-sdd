import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Facts about the opencode-sdd package that is currently running the
 * install CLI, read from its own `package.json`. Used to decide the
 * default plugin entry: a prerelease build (e.g. the `canary`
 * dist-tag) pins itself into the config instead of resolving the
 * `latest` release at opencode startup.
 */
export interface OwnPackageInfo {
  /** Absolute directory containing the package's `package.json`. */
  readonly root: string;
  /** The package's own `version` field (e.g. `1.2.1-canary.<sha>`). */
  readonly version: string;
  /**
   * `true` when `version` carries a SemVer prerelease suffix (`-`), the
   * marker the canary publish pipeline uses (`-canary.<sha>`). Release
   * versions (`1.2.1`) return `false`.
   */
  readonly prerelease: boolean;
}

/** The package name this CLI belongs to — matches `package.json#name`. */
const PACKAGE_NAME = 'opencode-sdd';

/** Upper bound on the upward directory walk (build/cli → package root). */
const MAX_WALK_DEPTH = 8;

/**
 * Locate the running opencode-sdd package by walking up from
 * `startUrl` (the compiled module's `import.meta.url`, e.g.
 * `<pkg>/build/cli/own-package.js`) to the first directory whose
 * `package.json` carries `name: "opencode-sdd"`. Works both from a repo
 * checkout or a published npm install; returns `null` when no such
 * package is found (never throws — the caller falls back to the default
 * entry).
 *
 * @param startUrl - `file://` URL of a module inside the running package.
 * @returns the package root, version, and prerelease flag, or `null`.
 */
export function readOwnPackage(startUrl: string): OwnPackageInfo | null {
  let dir = dirname(fileURLToPath(startUrl));
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    const version = readPackageVersion(join(dir, 'package.json'));
    if (version !== null) {
      return { root: dir, version, prerelease: version.includes('-') };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // Reached the filesystem root — nothing further to walk.
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * Read `version` from an opencode-sdd `package.json`. Returns `null`
 * when the file is absent, unparseable, or belongs to a different
 * package — the walk keeps going in those cases.
 */
function readPackageVersion(packageJsonPath: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown;
  } catch {
    return null;
  }
  const record = parsed as { name?: unknown; version?: unknown };
  if (record.name !== PACKAGE_NAME || typeof record.version !== 'string') {
    return null;
  }
  return record.version;
}
