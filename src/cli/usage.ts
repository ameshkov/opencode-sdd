/**
 * The full `--help` text. Lists the supported flags and the install
 * workflow. Printed verbatim to stdout on `--help` and hinted to stderr
 * on invalid usage. Kept in sync with the wizard's behaviour as part
 * of the feature's definition of done.
 */
export const USAGE_TEXT = `opencode-sdd install - set up the opencode-sdd plugin and SDD subagent models.

Usage:
  opencode-sdd install [-y|--yes] [--tag <spec> | --local [path]]
  opencode-sdd --help

Flags:
  -y, --yes   Auto-select the recommended model for each SDD subagent and
              skip the final confirmation gate (unattended installs).
  --tag <spec>
              Pin the plugin to an npm dist-tag or version (e.g. canary,
              latest, 1.2.0). Writes "opencode-sdd@<spec>" into the
              plugin array.
  --local [path]
              Register a local build instead of the npm package. The
              path defaults to the opencode-sdd package this CLI runs
              from; writes "file://<path>". Paths may be relative.
  --help      Show this help and exit.

Workflow:
  1. Detect the opencode binary on PATH.
  2. Resolve the plugin entry: --tag/--local win; otherwise a canary
     (prerelease) build pins the canary dist-tag and a release build
     keeps the latest entry.
  3. Discover patchable opencode configs (global, ENV override, project).
  4. Enumerate the models reachable from your configured providers.
  5. Apply the plugin entry and per-subagent model assignments with an
     idempotent, comment-preserving patch.

opencode installs the plugin from the registry on the next restart;
this wizard edits configuration only.
`;
