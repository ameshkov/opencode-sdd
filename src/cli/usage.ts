/**
 * The full `--help` text. Lists the supported flags and the install
 * workflow. Printed verbatim to stdout on `--help` and hinted to stderr
 * on invalid usage. Kept in sync with the wizard's behaviour as part
 * of the feature's definition of done.
 */
export const USAGE_TEXT = `opencode-sdd install - set up the opencode-sdd plugin and SDD subagent models.

Usage:
  opencode-sdd install [-y|--yes]
  opencode-sdd --help

Flags:
  -y, --yes   Auto-select the recommended model for each SDD subagent and
              skip the final confirmation gate (unattended installs).
  --help      Show this help and exit.

Workflow:
  1. Detect the opencode binary on PATH.
  2. Discover patchable opencode configs (global, ENV override, project).
  3. Enumerate the models reachable from your configured providers.
  4. Apply the plugin entry and per-subagent model assignments with an
     idempotent, comment-preserving patch.

opencode installs the plugin from the registry on the next restart;
this wizard edits configuration only.
`;
