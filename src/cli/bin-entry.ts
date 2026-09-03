import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `true` when the module is the process entry point (the CLI bin) rather
 * than an `import`.
 *
 * npm installs CLI bins as *symlinks* on POSIX (`node_modules/.bin/`), so
 * `npx opencode-sdd` reaches this module through the `.bin/opencode-sdd`
 * symlink: `process.argv[1]` carries the symlink path while
 * `import.meta.url` is already the resolved target file. Comparing the
 * two with `fs.realpathSync` resolves the symlink on both sides, whereas
 * a plain URL/string comparison would silently never match and the CLI
 * would exit 0 with no output.
 *
 * @param moduleUrl - this module's `import.meta.url`.
 * @param entry - `process.argv[1]` (the entry script path, possibly a
 *                symlink).
 * @returns `true` when `entry` resolves to this module's file.
 */
export function isDirectInvocation(moduleUrl: string, entry: string | undefined): boolean {
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    // Resolution failed (e.g. `node -e ...` with a bogus entry path) —
    // not a direct invocation of this module.
    return false;
  }
}
