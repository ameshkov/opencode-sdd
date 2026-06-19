# Development Guide

How to build, run, and debug the `opencode-sdd` plugin against a live
opencode instance. For architecture and contribution rules, see
[AGENTS.md](./AGENTS.md); for the user-facing pitch, see
[README.md](./README.md).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build Commands](#build-commands)
- [Debugging with opencode](#debugging-with-opencode)
    - [How the plugin loads](#how-the-plugin-loads)
    - [Load the plugin from a scratch project](#load-the-plugin-from-a-scratch-project)
    - [The debug loop](#the-debug-loop)
    - [Reading plugin logs](#reading-plugin-logs)
    - [Unit debugging without opencode](#unit-debugging-without-opencode)
    - [Recover when the plugin breaks startup](#recover-when-the-plugin-breaks-startup)

## Prerequisites

- **Node.js 22+** — the plugin targets ES2022 and runs inside the
  opencode host. Verify with `node --version`.
- **pnpm 10+** — the only supported package manager. Verify with
  `pnpm --version`.
- **opencode** — required only for end-to-end debugging. Install
  separately (for example `brew install opencode` on macOS) and verify
  with `opencode --version`.
- **Git** — needed for the Husky `pre-commit` hook, which runs the full
  `pnpm check` gate before every commit.

No global TypeScript or Vitest install is required; everything is pinned
in `devDependencies`. After cloning:

```sh
pnpm install
```

## Build Commands

All commands run through pnpm scripts defined in
[`package.json`](./package.json). The compiled plugin is emitted to
`build/` and is what opencode loads.

- `pnpm install` — install pinned dependencies.
- `pnpm build` — compile TypeScript to `build/` (`tsc`).
- `pnpm typecheck` — type-check production *and* test code (no emit).
- `pnpm test` — run the Vitest suite once.
- `pnpm test:watch` — run Vitest in watch mode for iterative TDD.
- `pnpm lint` — run ESLint on `src/` plus Knip unused-export analysis.
- `pnpm lint:fix` — auto-fix the ESLint issues that can be fixed.
- `pnpm knip` — run Knip unused-export analysis on its own.
- `pnpm format:check` — check Prettier *and* Markdownlint formatting.
- `pnpm format:fix` — auto-fix Prettier and Markdownlint issues.
- `pnpm check` — the full CI gate: `format:check`, `lint`,
  `typecheck`, and `test`. The `pre-commit` hook runs this too.
- `pnpm clean` — remove `node_modules/` and `build/`.

Day-to-day flow:

```sh
pnpm install
pnpm build      # produce build/index.js — opencode loads this
pnpm check      # verify everything before commit
```

## Debugging with opencode

The plugin is *not* a standalone process. opencode imports the compiled
module, calls its default `Plugin` function, and invokes the `config`
hook at startup. Debugging therefore means: build the plugin, point a
scratch opencode project at it, start opencode with verbose logging, and
inspect the logs.

### How the plugin loads

Two facts shape every debugging workflow:

1. opencode loads plugins **once at startup**. Any rebuild requires
   restarting opencode to pick up the change.
2. The compiled output in `build/` is self-contained. The
   `@opencode-ai/plugin` and `@opencode-ai/sdk` imports are type-only
   and erased by `tsc`, so the only runtime imports are the plugin's own
   relative modules. You can drop `build/` anywhere opencode can resolve
   it.

### Load the plugin from a scratch project

Keep this repo as the source of truth and load it into a *separate*
scratch project so you never pollute the plugin's working tree with
session artifacts. Create a throwaway directory:

```sh
mkdir -p /tmp/sdd-debug && cd /tmp/sdd-debug
```

Pick one of the two methods below.

**Method 1 — reference the local package (recommended).** This respects
the `exports`/`main` field in `package.json`, so opencode resolves
`build/index.js` automatically. Create `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/opencode-sdd"]
}
```

opencode installs plugins listed in the `plugin` array at startup and
caches them under its cache directory (`~/.cache/opencode/` on macOS/
Linux). Use the `file:///` form (three slashes): empty host followed by
the absolute path. Replace the path with the absolute path to this repo.

> **Note:** the `file:` specifier is not documented in opencode's
> official config schema, which only shows npm package names. It has
> been verified to work against opencode 1.17.x; behavior may differ on
> other versions. If it stops working, fall back to Method 2.

**Method 2 — thin loader in the plugin directory.** Local plugins are
loaded directly from `.opencode/plugins/`, and *each file* there is
treated as a separate plugin module. Because `build/` contains several
`index.js` files, do not copy the whole tree — instead add a single
loader that re-exports the compiled entry:

```sh
mkdir -p .opencode/plugins
```

`.opencode/plugins/sdd.js`:

```js
export { default } from '/absolute/path/to/opencode-sdd/build/index.js';
```

This works with a symlinked repo too. Only this one file is a plugin;
everything else is pulled in through the relative imports inside
`build/`.

Either way, rebuild before each restart:

```sh
pnpm build      # in the opencode-sdd repo
```

### The debug loop

1. In one terminal, keep the compiler running against this repo:

   ```sh
   pnpm exec tsc --watch
   ```

2. In another terminal, start opencode inside the scratch project with
   verbose, terminal-streamed logging:

   ```sh
   opencode --log-level DEBUG --print-logs
   ```

   - `--log-level DEBUG` enables the plugin's `logger.debug(...)`
     calls in `src/utils/logger.ts`.
   - `--print-logs` mirrors the server log stream to your terminal so
     you see plugin output as it happens.

3. Exercise the registered surface to confirm it loaded:

   - Run the slash command `/sdd-prd-write <a short idea>` — the
     template lives in `src/commands/sdd-prd-write.ts`.
   - Or invoke the `sdd-orchestrator` subagent, defined in
     `src/agents/sdd-orchestrator.ts`.

4. **Restart opencode** to reload the plugin after each rebuild.
   Plugins are only read at startup; there is no hot reload.

### Reading plugin logs

All plugin output is written through opencode's SDK via
`client.app.log(...)`, tagged with `service: 'opencode-sdd'` (see
`src/utils/logger.ts`). It never goes to `console.log`.

- **On disk** (macOS/Linux): `~/.local/share/opencode/log/`, in
  timestamped files such as `2026-06-08T163939.log` (plus an
  `opencode.log` rollfile). A small number of recent files are kept.
- **Filter for this plugin**: search the log file (or the
  `--print-logs` stream) for the `opencode-sdd` service tag. Every
  entry this plugin emits is written through `client.app.log(...)`
  with that tag (see `src/utils/logger.ts`).

Do **not** use `console.log` for diagnostics: it is not captured by
opencode's log pipeline and will not appear in the log files. Add
temporary calls through the existing `Logger` instead.

### Unit debugging without opencode

Most behavior can be debugged faster in Vitest than through opencode.
The suite in `src/*.test.ts` exercises the plugin against a stub SDK
client (`test/stub-client.ts`) that records every `client.app.log`
call, so no running server is needed.

```sh
pnpm test:watch
```

To inspect the effect of the `config` hook directly, reuse the pattern
from `src/index.test.ts`: call the plugin with a `stubClient()`, invoke
the returned `hooks.config(config)` with a plain `Config` object, and
assert on the mutated `config.agent` / `config.command` maps. To debug
interactively, run Vitest with an inspector:

```sh
pnpm exec vitest --inspect-brk
```

### Recover when the plugin breaks startup

Because opencode reads plugins at startup, a plugin that throws during
load can stop opencode from starting. The `config` hook in
`src/index.ts` already wraps registration in `try/catch` and logs the
error to avoid this, but a syntax error in the compiled output or a
throw *before* the hook returns can still block startup.

To recover:

1. Disable the plugin temporarily.
   - Method 1 projects: in `opencode.json`, clear the array:

      ```json
      { "plugin": [] }
      ```

   - Method 2 projects: remove or rename
     `.opencode/plugins/sdd.js`.
2. Restart opencode and confirm it boots.
3. Rebuild cleanly and check the logs from the failed start:

   ```sh
   pnpm clean && pnpm install && pnpm build
   ```

4. Re-enable the plugin and start opencode with
   `--log-level DEBUG --print-logs` to see the failure inline.
