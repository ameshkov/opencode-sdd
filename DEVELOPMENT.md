# Development Guide

How to set up a local environment, build, and debug the `opencode-sdd`
plugin against a live opencode instance. For code guidelines and
architecture, see [AGENTS.md](./AGENTS.md); for user-facing docs, see
[README.md](./README.md).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Development Commands](#development-commands)
- [Debugging with opencode](#debugging-with-opencode)
    - [How the plugin loads](#how-the-plugin-loads)
    - [Load the plugin from a scratch project](#load-the-plugin-from-a-scratch-project)
    - [The debug loop](#the-debug-loop)
    - [Unit debugging without opencode](#unit-debugging-without-opencode)
    - [Recover when the plugin breaks startup](#recover-when-the-plugin-breaks-startup)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

## Prerequisites

- **Node.js 24+** — verify with `node --version`.
- **pnpm 10+** — the only supported package manager; verify with
  `pnpm --version`.
- **opencode** — required for end-to-end debugging and `pnpm test:e2e`.
  Install separately (for example `brew install opencode` on macOS) and
  verify with `opencode --version`.
- **Git** — needed for the Husky `pre-commit` hook.

No global TypeScript or Vitest install is required; everything is pinned in
`devDependencies`. No environment variables or `.env` files are needed for
local development.

## Setup

After cloning the repository:

```sh
pnpm install
pnpm build      # produce build/index.js — opencode loads this
pnpm check      # full local gate before committing
```

## Development Commands

All commands run through pnpm scripts in [`package.json`](./package.json):

- `pnpm build` — compile TypeScript to `build/`, copy bundled assets, and
  verify no `@opencode-ai/*` runtime imports leaked.
- `pnpm typecheck` — type-check production and test code (no emit).
- `pnpm test` — run the Vitest unit suite once.
- `pnpm test:watch` — run Vitest in watch mode.
- `pnpm test:e2e` — run the mock-LLM e2e suite against a real `opencode`
  server. **Not** part of `pnpm check`; needs the `opencode` binary on PATH
  and a built `build/`. See [docs/e2e.md](./docs/e2e.md).
- `pnpm lint` — ESLint over `src/`, `test/`, `test-e2e/`, and
  `qa/scripts/`, plus Knip and the Gherkin plan checks.
- `pnpm lint:fix` — auto-fix the ESLint issues that can be fixed (Knip
  and the Gherkin plan checks are not run).
- `pnpm format:check` / `pnpm format:fix` — Prettier and Markdownlint.
- `pnpm check` — the full gate: `format:check`, `lint`, `typecheck`, and
  `test`.
- `pnpm qa:run` — interactive manual QA runner; see
  [`qa/README.md`](./qa/README.md).
- `pnpm clean` — remove `node_modules/`, `build/`, and `qa/output/`.

**Pre-commit hook** ([`.husky/pre-commit`](./.husky/pre-commit)) runs on
every commit and aborts on any failure:

1. Block staged lines matching `FIXME` or `TODO.*!!`.
2. Run `pnpm check`.
3. Build and run `pnpm test:e2e`.

Step 3 needs the `opencode` binary on PATH. For a WIP commit, use
`git commit --no-verify`, but re-run the gate before pushing — CI enforces
it.

## Debugging with opencode

The plugin is *not* a standalone process. opencode imports the compiled
module, calls its default `Plugin` function, and invokes the `config` hook
at startup. Debugging therefore means: build the plugin, load it into a
scratch opencode project, and read the logs.

### How the plugin loads

Two facts shape every debugging workflow:

1. opencode loads plugins **once at startup**. Rebuild and restart opencode
   to pick up a change; there is no hot reload.
2. The compiled output in `build/` is self-contained: the `@opencode-ai/*`
   imports are type-only and erased by `tsc`, so you can point opencode at
   `build/` from anywhere.

### Load the plugin from a scratch project

Keep this repo as the source of truth and load it into a *separate* scratch
project, so session artifacts never pollute the plugin's working tree.
Create the throwaway directory anywhere; the examples use a sibling:

```sh
mkdir -p ../opencode-plugin-tester && cd ../opencode-plugin-tester
```

Pick one of the two methods below.

**Method 1 — reference the local package (recommended).** opencode resolves
`build/index.js` through `package.json#exports`. This writes the scratch
project's `opencode.json` with a `file:///` plugin entry; the shell resolves
the absolute path:

```sh
cat > opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["file://$(cd ../opencode-sdd && pwd)"]
}
EOF
```

`opencode.json` lives at the scratch project root, not under `.opencode/`
(that directory is only used by Method 2).

> **Note:** the `file:` specifier is not documented in opencode's official
> config schema and has only been verified against opencode 1.18.x. If it
> stops working, use Method 2.

**Method 2 — thin loader in the plugin directory.** Local plugins load
directly from `.opencode/plugins/`, and *each file* there is a separate
plugin module. Because `build/` contains several `index.js` files, do not
copy the whole tree — add a single loader:

```sh
mkdir -p .opencode/plugins
```

`.opencode/plugins/sdd.js`:

```js
export { default } from '/absolute/path/to/opencode-sdd/build/index.js';
```

### The debug loop

1. Keep the compiler running in this repo:

   ```sh
   pnpm exec tsc -p tsconfig.build.json --watch
   ```

   This emits `build/` on every change. It does not copy assets — after
   editing `src/assets/`, run `node scripts/copy-assets.mjs` or a full
   `pnpm build`.

2. In the scratch project, run opencode and capture the logs.

   - **Non-interactively to a file** (recommended for plugin debugging).
     `--print-logs` writes to **stderr**, so `2>` captures the plugin's
     DEBUG lines:

     ```sh
     opencode run --log-level DEBUG --print-logs \
       "/prd-write <a short idea>" 2>./opencode.log
     ```

     Plugin output goes through `client.app.log(...)` (see
     `src/utils/logger.ts`), tagged `service: 'opencode-sdd'`. The log
     formatter does not print that tag, so filter by message:

     ```sh
     grep -E "plugin loading|loading SDD commands|SDD commands registered|registered command|failed to register SDD commands" ./opencode.log
     ```

   - **Interactive TUI.** `--print-logs` does **not** work here (the TUI
     owns the terminal and swallows stderr), so tail the on-disk log:

     ```sh
     opencode --log-level DEBUG
     tail -F ~/.local/share/opencode/log/opencode.log
     ```

3. Exercise the registered surface to confirm it loaded — for example
   `/prd-write <a short idea>` (the template lives in
   `src/assets/commands/prd-write.md`).

4. **Restart opencode** after each rebuild.

Do **not** use `console.log` for diagnostics: opencode does not capture it.
Route temporary calls through the existing `Logger`
(`src/utils/logger.ts`).

### Unit debugging without opencode

Most behavior debugs faster in Vitest. The suite exercises the plugin
against a stub SDK client (`test/stub-client.ts`) that records every
`client.app.log` call, so no running server is needed:

```sh
pnpm test:watch
```

To inspect the effect of the `config` hook directly, follow the pattern in
`src/index.test.ts`: call the plugin with a `stubClient()`, invoke the
returned `hooks.config(config)` with a plain `Config` object, and assert on
the mutated `config.agent` / `config.command` maps. To debug interactively:

```sh
pnpm exec vitest --inspect-brk
```

### Recover when the plugin breaks startup

A throw during load can stop opencode from starting. The `config` hook in
`src/index.ts` already wraps registration in `try/catch`, but a syntax
error in the compiled output can still block startup. To recover:

1. Disable the plugin temporarily.
   - Method 1 projects: set `{ "plugin": [] }` in `opencode.json`.
   - Method 2 projects: remove or rename `.opencode/plugins/sdd.js`.
2. Restart opencode and confirm it boots.
3. Rebuild cleanly and check the logs from the failed start:

   ```sh
   pnpm clean && pnpm install && pnpm build
   ```

4. Re-enable the plugin and start opencode with
   `--log-level DEBUG --print-logs` to see the failure inline.

## Troubleshooting

- **`pnpm test:e2e` fails with "opencode binary not found" or "build/ not
  found".** The e2e `globalSetup` (`test-e2e/global-setup.ts`) fails fast
  when the binary is missing or `build/index.js` does not exist. Install
  the binary and run `pnpm build` first.

- **`file://` plugin loading stops working.** The `file:` specifier is not
  in opencode's official config schema and has only been verified against
  opencode 1.18.x. Fall back to Method 2.

- **Plugin logs are empty even with `--log-level DEBUG`.** You are in the
  TUI, where `--print-logs` is swallowed and logs only land on disk. Tail
  `~/.local/share/opencode/log/opencode.log` instead.

- **`console.log` output never appears.** opencode does not capture it.
  Route diagnostics through the plugin's `Logger` (`src/utils/logger.ts`).

- **Pre-commit hook hangs or fails on the e2e step.** It needs the
  `opencode` binary. Use `--no-verify` for a WIP commit, but re-run
  `pnpm check && pnpm test:e2e` before pushing.

- **The editor reports `Cannot find name 'node:*'` in tests but
  `pnpm typecheck` passes.** The editor is keying off the wrong tsconfig;
  see the "TypeScript project structure" note in
  [AGENTS.md](./AGENTS.md#configuration--documentation).

- **Stale commands after editing Markdown under `src/assets/commands/`.**
  The loader reads bundled assets at registration time. Rebuild
  (`pnpm build`) and restart opencode — there is no hot reload.

- **Docker build fails on `--output type=local`.** BuildKit is required.
  Prefix the command with `DOCKER_BUILDKIT=1`.

## Additional Resources

- [AGENTS.md](./AGENTS.md) — code guidelines, project structure, and the
  plugin surface contract.
- [README.md](./README.md) — user-facing pitch and the short install path.
- [`docs/reference/install-cli.md`](./docs/reference/install-cli.md) and
  [`docs/reference/commands.md`](./docs/reference/commands.md) — install
  wizard and slash-command reference.
- [`docs/e2e.md`](./docs/e2e.md) — how the mock-LLM e2e suite works.
- [`qa/README.md`](./qa/README.md) — the manual QA suite (real models via
  an OpenRouter-backed gateway).
- [`Dockerfile`](./Dockerfile) and
  [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — the
  reproducible full gate and the CI matrix. To run the gate without host
  tooling, collect all result files with
  `DOCKER_BUILDKIT=1 docker build --output type=local,dest=./ci-output .`.
- [CHANGELOG.md](./CHANGELOG.md) — release history.
