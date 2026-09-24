# Install CLI Reference

The `opencode-sdd` package ships an `install` wizard that edits an opencode
config to register the plugin and assign a model to each SDD subagent. It
does not install the plugin itself: opencode resolves the plugin entry on
the next restart. The wizard supports **opencode 1.x (>= 1.18.29)** and
**opencode 2.x (2.0.x)** and writes the config shape native to the detected
host. Run it via `npx` (no global install needed):

```sh
npx opencode-sdd install
```

## Usage

```text
opencode-sdd install [-y|--yes] [--tag <spec> | --local [path]]
opencode-sdd --help
opencode-sdd --version
```

## Options

| Option | Description |
| --- | --- |
| `-y`, `--yes` | Auto-select the recommended model for each SDD subagent and skip the final confirmation gate (unattended installs). |
| `--tag <spec>` | Pin the plugin to an npm dist-tag or version (for example `canary`, `latest`, `1.2.0`). Writes `"opencode-sdd@<spec>"` into the plugin list. |
| `--local [path]` | Register a local build instead of the npm package. The path defaults to the `opencode-sdd` package the CLI runs from; writes `"file://<path>"` on V1 and `"file://<path>/build"` on V2 (V2 ignores `package.json#main`). Paths may be relative. |
| `--help` | Print help and exit. |
| `--version` | Print the `opencode-sdd` version (for example `opencode-sdd 1.4.0`) and exit. |

## Workflow

1. Detect the `opencode` binary on `PATH`, parse its version, and resolve
   the host line. V1 below 1.18.29 is refused with an upgrade hint;
   unparseable output is reported separately from a missing binary.
2. Resolve the plugin entry: `--tag`/`--local` win; otherwise a canary
   (prerelease) build pins the canary dist-tag and a release build keeps the
   bare `latest` entry.
3. Discover patchable opencode configs: project-local, an `OPENCODE_CONFIG`
   override, and global. The default target is the project config when
   present, otherwise the global config; the `OPENCODE_CONFIG` override
   is only the default when neither exists.
4. Enumerate the models reachable from the configured providers.
5. Show a before/after diff, then apply the plugin entry and the
   per-subagent model assignments with an idempotent, comment- and
   order-preserving patch.

The config keys are host-specific: V1 uses `plugin` and `agent`, V2 uses
`plugins` and `agents`. The model probe is host-specific too: V1 starts a
headless server through `@opencode-ai/sdk`; V2 spawns `opencode serve` with
a generated password and reads its HTTP API. A failed probe degrades to a
plugin-only patch with a warning on both hosts.

Re-running the wizard with the same selection leaves the config
byte-for-byte unchanged.

## Plugin entry forms

The wizard writes exactly three forms:

- `"opencode-sdd"` — the npm `latest` release (the default for release
  builds).
- `"opencode-sdd@<spec>"` — a pinned dist-tag or version, written by
  `--tag` or self-pinned by a canary build.
- `"file://<abs-path>"` — a local build directory, written by `--local`.
  V1 points at the package root; V2 points at the compiled `build/`
  directory (V2 resolves `<dir>/index.js` and ignores `package.json#main`).

It never writes the `npm:`-prefixed form: `npm-package-arg` parses it as an
alias target, not a registry spec, so it cannot resolve to `opencode-sdd`.
The `opencode-sdd@<spec>` and `file://` forms are supported as of opencode
1.18.x (verified against 1.18.29), which parses plugin specs with
`npm-package-arg` and installs them with npm's Arborist. On V2 the npm
forms resolve by package name; the local form must point at `build/`.

A canary (prerelease) build self-pins the `canary` dist-tag even without
`--tag`, so the config always references the build that was installed. The
wizard never silently switches a config that already pins a specific build
back to the bare `latest` entry — it prints a warning and leaves the pinned
reference untouched.

## Model recommendations

The wizard recommends a model per subagent by matching keywords
case-insensitively against each reachable model's id and name:

| Subagent | Keywords (priority order) | Tier |
| --- | --- | --- |
| `sdd-planner` | `deepseek`, `kimi`, `qwen`, `opus`, `gpt` | strong |
| `sdd-reviewer` | `deepseek`, `kimi`, `qwen`, `opus`, `gpt` | strong |
| `sdd-coder` | `deepseek`, `kimi`, `qwen`, `opus`, `gpt` | strong |
| `sdd-validator` | `deepseek`, `kimi`, `qwen`, `opus`, `gpt` | strong |
| `sdd-plan-reviewer` | `deepseek`, `qwen` | cheap |
| `sdd-explore` | `deepseek`, `qwen` | cheap |

The tier drives the fallback when no keyword matches: a `strong` agent falls
back to the config's `model`; a `cheap` agent falls back to `small_model`,
then `model`. When neither a match nor a fallback exists, the wizard leaves
that agent's model unset and warns instead of guessing.

The table is defined in `src/cli/recommend.ts`
(`SUBAGENT_RECOMMENDATIONS`) and is the source of truth the wizard consults.

## Manual install equivalent

The manual path registers the plugin but does not set per-subagent models.
On opencode 1.x add `opencode-sdd` to the `plugin` array and set each
`agent["<subagent>"].model` entry to a `provider/model` string from one of
your configured providers:

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["opencode-sdd"],
    "agent": {
        "sdd-planner": { "model": "anthropic/claude-sonnet-4" },
        "sdd-reviewer": { "model": "anthropic/claude-sonnet-4" },
        "sdd-coder": { "model": "anthropic/claude-sonnet-4" },
        "sdd-validator": { "model": "anthropic/claude-sonnet-4" },
        "sdd-plan-reviewer": { "model": "openai/gpt-4o-mini" },
        "sdd-explore": { "model": "openai/gpt-4o-mini" }
    }
}
```

On opencode 2.x the keys are `plugins` and `agents`:

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugins": ["opencode-sdd"],
    "agents": {
        "sdd-planner": { "model": "anthropic/claude-sonnet-4" },
        "sdd-reviewer": { "model": "anthropic/claude-sonnet-4" },
        "sdd-coder": { "model": "anthropic/claude-sonnet-4" },
        "sdd-validator": { "model": "anthropic/claude-sonnet-4" },
        "sdd-plan-reviewer": { "model": "openai/gpt-4o-mini" },
        "sdd-explore": { "model": "openai/gpt-4o-mini" }
    }
}
```

Replace the example `provider/model` values with the IDs your providers
expose (run `npx opencode-sdd install` to see them listed and recommended
per subagent). Restart opencode after editing the config.

## See also

- [Slash Command Reference](./commands.md) — the commands the plugin
  registers.
- [README](../../README.md#install) — the short install path.
