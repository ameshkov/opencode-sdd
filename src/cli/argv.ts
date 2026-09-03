/**
 * Parsed CLI arguments (excluding `node` and the script path). `yes` and
 * `help` are independent flags; `help` short-circuits regardless of the
 * subcommand. `tag`/`local`/`localPath` select the plugin entry the
 * installer registers (`--tag <spec>` pins an npm dist-tag/version;
 * `--local [path]` registers a local build directory).
 *
 * @internal Exported for tests and the parent discriminated-union type;
 *           not directly importable from a barrel.
 */
export interface ParsedArgs {
  subcommand: 'install' | undefined;
  yes: boolean;
  help: boolean;
  /** Value of `--tag <spec>`, when given. */
  tag: string | undefined;
  /** `true` when `--local` was given (with or without a path). */
  local: boolean;
  /** Value of `--local [path]`, when a path was given. */
  localPath: string | undefined;
}

/**
 * Result of {@link parseArgs}: either the parsed args (`ok: true`) or
 * a typed error (`ok: false`) describing the first violation. The
 * error variant's `reason` discriminates the failure mode so the
 * caller can map it to the right exit status and message.
 */
export type ParseResult =
  | { ok: true; args: ParsedArgs }
  | { ok: false; reason: 'unknown-flag'; flag: string }
  | { ok: false; reason: 'missing-subcommand' }
  | { ok: false; reason: 'unknown-subcommand'; subcommand: string }
  | { ok: false; reason: 'missing-flag-value'; flag: string }
  | { ok: false; reason: 'conflicting-flags' };

const KNOWN_SUBCOMMANDS = new Set(['install']);

/**
 * Read the value of a value-taking flag (`--tag`): the next argv token,
 * unless it is absent or another flag — in which case the value is
 * missing. The caller advances past the consumed token.
 */
function readFlagValue(argv: string[], index: number): string | undefined {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    return undefined;
  }
  return value;
}

/**
 * Read the optional path of `--local`: the next argv token, unless it is
 * a flag or a known subcommand (so `--local install` keeps `install` as
 * the subcommand and `--local` defaults to the running package).
 */
function readLocalPath(argv: string[], index: number): string | undefined {
  const next = argv[index + 1];
  if (next !== undefined && !next.startsWith('-') && !KNOWN_SUBCOMMANDS.has(next)) {
    return next;
  }
  return undefined;
}

/**
 * Consume a positional token after all flags have been checked: it is
 * the subcommand when none is set yet, else a second positional (or an
 * offending non-flag) is an error. Returns the updated subcommand or
 * the parse error to report.
 */
function consumePositional(
  token: string,
  subcommand: 'install' | undefined,
): { subcommand: 'install' } | { error: ParseResult } {
  if (subcommand === undefined) {
    if (KNOWN_SUBCOMMANDS.has(token)) {
      return { subcommand: 'install' };
    }
    return { error: { ok: false, reason: 'unknown-subcommand', subcommand: token } };
  }
  return { error: { ok: false, reason: 'unknown-flag', flag: token } };
}

/**
 * Parse the CLI argv (excluding `node` and the script path).
 *
 * Returns a discriminated union: `{ ok: true, args }` on success, or
 * a typed error describing the first violation (unknown flag, missing
 * subcommand, unknown subcommand, missing flag value, or conflicting
 * `--tag`/`--local` flags). `--help` short-circuits to success
 * regardless of the subcommand; an unknown flag is still an error even
 * alongside `--help` (no silent misconfiguration).
 */
export function parseArgs(argv: string[]): ParseResult {
  let subcommand: 'install' | undefined;
  let yes = false;
  let help = false;
  let tag: string | undefined;
  let local = false;
  let localPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help') {
      help = true;
      continue;
    }
    if (token === '-y' || token === '--yes') {
      yes = true;
      continue;
    }
    if (token === '--tag') {
      const value = readFlagValue(argv, i);
      if (value === undefined) {
        return { ok: false, reason: 'missing-flag-value', flag: '--tag' };
      }
      tag = value;
      i++;
      continue;
    }
    if (token === '--local') {
      local = true;
      const path = readLocalPath(argv, i);
      if (path !== undefined && localPath === undefined) {
        localPath = path;
        i++;
      }
      continue;
    }
    if (token.startsWith('-')) {
      return { ok: false, reason: 'unknown-flag', flag: token };
    }
    const positional = consumePositional(token, subcommand);
    if ('error' in positional) {
      return positional.error;
    }
    subcommand = positional.subcommand;
  }

  return finalizeArgs(subcommand, yes, help, tag, local, localPath);
}

/**
 * Apply the post-argv validation and build the success result: `--tag`
 * and `--local` are mutually exclusive, and without `--help` a
 * subcommand is required.
 */
function finalizeArgs(
  subcommand: 'install' | undefined,
  yes: boolean,
  help: boolean,
  tag: string | undefined,
  local: boolean,
  localPath: string | undefined,
): ParseResult {
  if (tag !== undefined && local) {
    return { ok: false, reason: 'conflicting-flags' };
  }
  if (!help && subcommand === undefined) {
    return { ok: false, reason: 'missing-subcommand' };
  }
  return { ok: true, args: { subcommand, yes, help, tag, local, localPath } };
}
