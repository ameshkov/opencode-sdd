/**
 * Parsed CLI arguments (excluding `node` and the script path). `yes` and
 * `help` are independent flags; `help` short-circuits regardless of the
 * subcommand.
 *
 * @internal Exported for tests and the parent discriminated-union type;
 *           not directly importable from a barrel.
 */
export interface ParsedArgs {
  subcommand: 'install' | undefined;
  yes: boolean;
  help: boolean;
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
  | { ok: false; reason: 'unknown-subcommand'; subcommand: string };

const KNOWN_SUBCOMMANDS = new Set(['install']);

/**
 * Parse the CLI argv (excluding `node` and the script path).
 *
 * Returns a discriminated union: `{ ok: true, args }` on success, or
 * a typed error describing the first violation (unknown flag, missing
 * subcommand, or unknown subcommand). `--help` short-circuits to
 * success regardless of the subcommand; an unknown flag is still an
 * error even alongside `--help` (no silent misconfiguration).
 */
export function parseArgs(argv: string[]): ParseResult {
  let subcommand: 'install' | undefined;
  let yes = false;
  let help = false;

  for (const token of argv) {
    if (token.startsWith('-')) {
      if (token === '-y' || token === '--yes') {
        yes = true;
        continue;
      }
      if (token === '--help') {
        help = true;
        continue;
      }
      return { ok: false, reason: 'unknown-flag', flag: token };
    }
    if (subcommand === undefined) {
      if (KNOWN_SUBCOMMANDS.has(token)) {
        subcommand = 'install';
        continue;
      }
      return { ok: false, reason: 'unknown-subcommand', subcommand: token };
    }
    return { ok: false, reason: 'unknown-flag', flag: token };
  }

  if (!help && subcommand === undefined) {
    return { ok: false, reason: 'missing-subcommand' };
  }

  return { ok: true, args: { subcommand, yes, help } };
}
