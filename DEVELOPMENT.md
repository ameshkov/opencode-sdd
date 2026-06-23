# Development Guide

How to build, run, and debug the `opencode-sdd` plugin against a live
opencode instance. For architecture and contribution rules, see
[AGENTS.md](./AGENTS.md); for the user-facing pitch, see
[README.md](./README.md).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build Commands](#build-commands)
- [Running Checks in Docker](#running-checks-in-docker)
- [Continuous Integration](#continuous-integration)
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
- **opencode** — required for end-to-end debugging **and** the e2e
  test suite (`pnpm test:e2e`). Install separately (for example
  `brew install opencode` on macOS) and verify with
  `opencode --version`.
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
- `pnpm test:e2e` — run the mock-LLM e2e suite against a real `opencode`
  server. **Not** part of `pnpm check`; requires the `opencode` binary on
  PATH and a built `build/` (run `pnpm build` first). Fails loudly if
  either is missing. See [docs/e2e.md](./docs/e2e.md) for details.
- `pnpm clean` — remove `node_modules/` and `build/`.

Day-to-day flow:

```sh
pnpm install
pnpm build      # produce build/index.js — opencode loads this
pnpm check      # verify everything before commit
```

## Running Checks in Docker

[`Dockerfile`](./Dockerfile) is a multi-stage build that reproduces the
full local gate (`format:check`, `lint`, `typecheck`, `test`) **plus**
the mock-LLM e2e suite — without needing Node, pnpm, or the `opencode`
binary installed on the host. Each gate is a stage that writes a
`*-results.txt` file, and each has a companion `FROM scratch` collector
stage, so BuildKit's `--output type=local` pulls just that result file
into a local directory instead of producing a tagged image.

Build everything and collect all result files into `./ci-output/`:

```sh
DOCKER_BUILDKIT=1 docker build --output type=local,dest=./ci-output .
```

Or run a single gate and collect only its result file:

```sh
# Lint + format + type-check
DOCKER_BUILDKIT=1 docker build --target lint-output --output type=local,dest=./ci-output .
# Unit tests
DOCKER_BUILDKIT=1 docker build --target unit-test-output --output type=local,dest=./ci-output .
# E2E tests (downloads and installs the opencode binary)
DOCKER_BUILDKIT=1 docker build --target e2e-output --output type=local,dest=./ci-output .
```

`./ci-output/` then contains the matching `*-results.txt` file(s). A
failing gate fails the build: the `bash -o pipefail` shell propagates the
command's exit status through `tee`, so a non-zero `docker build` exit
code means that gate failed.

Notes:

- BuildKit (`# syntax=docker/dockerfile:1`) is required for the pnpm
  cache mounts and for `--output type=local`.
- The `opencode` binary version is pinned via the `OPENCODE_VERSION`
  build arg (default `1.17.8`, matching the version the e2e suite targets
  in [docs/e2e.md](./docs/e2e.md)).
  Override with `--build-arg OPENCODE_VERSION=...`.
- `.dockerignore` excludes `build/`, `node_modules/`, and tooling
  directories so the image always starts from a clean source tree.
- `ci-output/` is gitignored (see [`.gitignore`](./.gitignore)).

## Continuous Integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push
to `main`/`master`, on `v*` tags, and on pull requests, with four jobs:

- **ci** — the full local gate (`pnpm check`: format, lint, typecheck,
  unit tests), on Ubuntu.
- **e2e-tests** — the mock-LLM e2e suite (`pnpm test:e2e`) on an
  Ubuntu/macOS/Windows matrix. Docker can only reproduce Linux, so these
  run natively per OS to verify the plugin and its e2e suite work
  cross-platform. The `opencode` binary is installed via the
  `opencode-ai` npm package, pinned to the version in
  [docs/e2e.md](./docs/e2e.md).
- **docker** — the entire quality gate (format, lint, typecheck, unit
  tests, and the e2e suite) built and run through the
  [`Dockerfile`](./Dockerfile) `ci-output` collector on Ubuntu. It guards
  the reproducible, host-tool-free CI path described above ("Running
  Checks in Docker") alongside the native matrix.
- **release** — on `v*` tags, once the other jobs pass, builds the plugin,
  packs it, and publishes a GitHub Release with auto-generated notes and
  the resulting `*.tgz`.

The native matrix (Node + pnpm) covers Windows and macOS; the Docker lane
reproduces the full containerized Linux gate.

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
session artifacts. Create the throwaway directory anywhere you like;
the examples below use a sibling of this repo:

```sh
mkdir -p ../opencode-plugin-tester && cd ../opencode-plugin-tester
```

> [!TIP]
> Open both `opencode-sdd` and `opencode-plugin-tester` in the same
> editor as a **multi-root workspace** (VS Code: *Add Folder to
> Workspace...*). You can then edit the plugin and its test project side
> by side, and a single `pnpm build` watcher in the plugin root is
> visible from the same window.

Pick one of the two methods below.

**Method 1 — reference the local package (recommended).** This respects
the `exports`/`main` field in `package.json`, so opencode resolves
`build/index.js` automatically. The snippet below writes the project
`opencode.json` at the scratch project root with the `file:///` plugin
entry pointing at this repo — copy and paste it as is, the shell
resolves the absolute path:

```sh
cat > opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["file://$(cd ../opencode-sdd && pwd)"]
}
EOF
```

> [!NOTE]
> `opencode.json` is the project config and lives at the **project
> root**, not under `.opencode/`. The `.opencode/` directory is only
> used by Method 2 below for local plugin files. The unquoted heredoc
> (`<<EOF`) lets `$(cd ...)` expand to the absolute repo path, while
> the `\$schema` escape keeps the JSON key literal. The resulting
> `opencode.json` contains a literal `$schema` key and a fully
> resolved `plugin` path.

opencode installs plugins listed in the `plugin` array at startup and
caches them under its cache directory (`~/.cache/opencode/` on macOS/
Linux). Use the `file:///` form (three slashes): empty host followed by
the absolute path.

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

2. In another terminal inside the scratch project, choose how you want
   to observe logs. `--log-level DEBUG` enables the plugin's
   `logger.debug(...)` calls in `src/utils/logger.ts`.

   - **Captured to a file** (recommended for plugin debugging). Run
     opencode non-interactively and redirect the log stream into the
     scratch project. `--print-logs` writes to **stderr**, so `2>`
     captures the full stream — including the plugin's DEBUG lines — to
     a file you can grep and scroll:

     ```sh
     opencode run --log-level DEBUG --print-logs \
       "/prd-write <a short idea>" 2>./opencode.log
     ```

   - **Interactive TUI**. Start opencode normally, then tail the
     on-disk log in a third terminal. `--print-logs` does **not** work
     here: the TUI owns the terminal and swallows stderr, so logs only
     land on disk (see [Reading plugin logs](#reading-plugin-logs)):

     ```sh
     opencode --log-level DEBUG
     tail -F ~/.local/share/opencode/log/opencode.log
     ```

3. Exercise the registered surface to confirm it loaded:

   - Run the slash command `/prd-write <a short idea>` — the
     template lives in `src/assets/commands/prd-write.md`.

4. **Restart opencode** to reload the plugin after each rebuild.
   Plugins are only read at startup; there is no hot reload.

### Reading plugin logs

All plugin output is written through opencode's SDK via
`client.app.log(...)`, tagged with `service: 'opencode-sdd'` (see
`src/utils/logger.ts`). It never goes to `console.log`.

- **On disk** (macOS/Linux): `~/.local/share/opencode/log/`, in
  timestamped files such as `2026-06-08T163939.log` (plus an
  `opencode.log` rollfile). A small number of recent files are kept.
- **Where the stream shows up** depends on the opencode mode:
    - `opencode run --print-logs 2>./opencode.log` — the full log
      stream is written to your redirected file. This is the
      recommended way to inspect plugin output.
    - `opencode` (the TUI) — `--print-logs` is swallowed by the TUI and
      never reaches your terminal; logs are only written to the on-disk
      directory above. Tail that file from a separate terminal.
- **Filter for this plugin**: opencode's log formatter does **not**
  print the `service` field, so grep for the plugin's distinctive
  messages instead — every line this plugin emits is one of these:

  ```sh
  grep -E "plugin loading|loading SDD commands|SDD commands registered|registered command|failed to register SDD commands" ./opencode.log
  ```

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
