### System Design

Design for a command-line tool:

- The tool runs and exits — no long-lived state, no background daemons.
  Perform the requested work and exit with an appropriate code (0 for
  success, non-zero for failure).
- Prefer stdout for output, stderr for diagnostics and errors. Never write
  structured data to stderr when the user expects it on stdout (e.g., in
  `--json` mode).
- Be composable — read from stdin when no file argument is given; write to
  stdout so the output can be piped to other tools.
- Fail fast with clear messages — validate inputs early, report the first
  error with enough context to fix it, and exit.
- Support `--quiet`, `--verbose`, and `--help` flags consistently.
  Default to moderate output; silence progress on `--quiet`; add
  diagnostics on `--verbose`.
- Keep startup time fast — defer heavy imports and initialization until
  they are actually needed by the invoked command.
