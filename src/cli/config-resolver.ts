import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findConfigInDir,
  findRepoRoot,
  resolveGlobalConfigBase,
  type ResolveGlobalDirEnv,
} from './config-paths.js';

/**
 * Where a discovered candidate came from. The `'create'` source is
 * wizard-only: never emitted by {@link enumerateCandidates} (discovery
 * returns only `project`/`env`/`global`), never picked by
 * {@link pickDefault} (it is deliberately NOT in
 * {@link DEFAULT_PRIORITY} — `pickDefault` returns `null` for a list
 * containing only `'create'`, so the `--yes`+empty path errors rather
 * than silently creating). The synthetic `'create'` candidate is
 * constructed in `install.ts`'s `createNewConfig` helper when
 * `enumerateCandidates` returns `[]`.
 */
type CandidateSource = 'project' | 'env' | 'global' | 'create';

/**
 * A single discovered opencode config candidate. `path` is absolute
 * and the file is guaranteed to exist at discovery time.
 */
export interface Candidate {
  source: CandidateSource;
  path: string;
}

/**
 * Inputs to {@link enumerateCandidates}: the resolved cwd, the process
 * environment (only `OPENCODE_CONFIG`, `XDG_CONFIG_HOME`, and
 * `APPDATA` are read), plus the platform-specific home-resolution
 * inputs from {@link ResolveGlobalDirEnv}.
 */
export interface ResolverEnv extends ResolveGlobalDirEnv {
  /** Absolute cwd (e.g. `process.cwd()`). */
  cwd: string;
}

/**
 * The default target precedence — project (narrowest) > global > env
 * — so a project-local config is picked when one exists, otherwise the
 * global config. `OPENCODE_CONFIG` is an explicit candidate but is
 * picked as the default only when neither a project nor a global
 * config is discovered.
 */
const DEFAULT_PRIORITY: readonly CandidateSource[] = ['project', 'global', 'env'];

/**
 * Enumerate patchable opencode config candidates:
 *
 * 1. **project** — walk up from `env.cwd` to the nearest
 *    `.git`-bearing root ({@link findRepoRoot}); look for
 *    `opencode.json`/`.jsonc` at that root.
 * 2. **env** — if `env.env.OPENCODE_CONFIG` is set, resolve it against
 *    `env.cwd`; include it only if the file exists.
 * 3. **global** — {@link resolveGlobalConfigBase}; look for
 *    `opencode.json`/`.jsonc` inside it.
 *
 * Returns the list in discovery order (project -> env -> global),
 * deduped by absolute path so a coincidental `OPENCODE_CONFIG`/project
 * or `OPENCODE_CONFIG`/global collision does not surface twice in the
 * prompt. Discovery is read-only; no writes.
 */
export function enumerateCandidates(env: ResolverEnv): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  const add = (source: CandidateSource, path: string) => {
    if (seen.has(path)) {
      return;
    }
    seen.add(path);
    out.push({ source, path });
  };

  // 1. Project: repo-root walk-up, then look for opencode.json/.jsonc there.
  const repoRoot = findRepoRoot(env.cwd);
  if (repoRoot !== null) {
    const projectPath = findConfigInDir(repoRoot);
    if (projectPath !== null) {
      add('project', projectPath);
    }
  }

  // 2. Env override: OPENCODE_CONFIG points at an explicit file.
  const envVar = env.env.OPENCODE_CONFIG;
  if (envVar !== undefined && envVar.length > 0) {
    const envPath = resolve(env.cwd, envVar);
    if (existsSync(envPath)) {
      add('env', envPath);
    }
  }

  // 3. Global: ~/.config/opencode or %APPDATA%/opencode.
  const globalDir = resolveGlobalConfigBase(env);
  const globalPath = findConfigInDir(globalDir);
  if (globalPath !== null) {
    add('global', globalPath);
  }

  return out;
}

/**
 * Pick the default target candidate by precedence (`project` >
 * `global` > `env`). Returns `null` when the candidate list is empty
 * — the wizard then reports "no resolvable target" and (interactively)
 * offers the create-new fallback.
 */
export function pickDefault(candidates: readonly Candidate[]): Candidate | null {
  for (const source of DEFAULT_PRIORITY) {
    const found = candidates.find((c) => c.source === source);
    if (found !== undefined) {
      return found;
    }
  }
  return null;
}
