import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The two opencode config filenames, in preference order: `.json`
 * wins over `.jsonc` when both are present in the same directory.
 */
const CONFIG_FILENAMES = ['opencode.json', 'opencode.jsonc'] as const;

/**
 * Inputs to {@link resolveGlobalConfigBase}, made explicit so tests can
 * drive cross-platform behaviour without touching `process.env` or
 * `os.platform`.
 */
export interface ResolveGlobalDirEnv {
  /** Resolved home directory (e.g. `os.homedir()`). */
  homedir: string;
  /** Process environment (only `XDG_CONFIG_HOME` and `APPDATA` are read). */
  env: Record<string, string | undefined>;
  /** `process.platform` value: `'darwin' | 'linux' | 'win32'`. */
  platform: string;
}

/**
 * Resolve the directory that holds the global opencode config —
 * `<XDG_CONFIG_HOME or ~/.config>/opencode` on macOS/Linux, and
 * `<APPDATA or ~/AppData/Roaming>/opencode` on Windows. Returns the
 * directory path whether or not it exists; the caller checks for an
 * opencode config file inside it via {@link findConfigInDir}.
 */
export function resolveGlobalConfigBase(env: ResolveGlobalDirEnv): string {
  if (env.platform === 'win32') {
    const appdata = env.env.APPDATA ?? join(env.homedir, 'AppData', 'Roaming');
    return join(appdata, 'opencode');
  }
  const xdg = env.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(env.homedir, '.config');
  return join(base, 'opencode');
}

/**
 * Walk up from `cwd` looking for the nearest directory that contains a
 * `.git` (file or directory — a git worktree uses a `.git` file).
 * Returns that directory's absolute path, or `null` when the walk
 * reaches the filesystem root without finding one. Never throws.
 */
export function findRepoRoot(cwd: string): string | null {
  let dir = cwd;
  // Walk until dirname stops changing (filesystem root).
  for (;;) {
    if (existsSync(join(dir, '.git'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Return the first of {@link CONFIG_FILENAMES} that exists in `dir`, or
 * `null` when neither exists (or the directory itself does not exist).
 * Never throws; a missing directory or a non-directory path is treated
 * as "no config here".
 */
export function findConfigInDir(dir: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }
  try {
    if (!statSync(dir).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }
  for (const name of CONFIG_FILENAMES) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
