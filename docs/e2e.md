# End-to-End Test Suite

The `test-e2e/` suite exercises the `opencode-sdd` plugin against a **real
`opencode` server** (used as a library), driven by a **local mock
OpenAI-compatible LLM** built on `node:http` + SSE. It is fully offline,
needs no API keys, and is deterministic — consecutive runs are byte-identical.

Unit tests (`src/**/*.test.ts`) cover the plugin's internals in isolation;
this suite covers what only surfaces when opencode actually loads the plugin
and runs a command end to end — command registration, dispatch through the
agent loop, the `write` tool executing, and bundled template assets being
inlined into the model prompt. How the suite works (the mock LLM, server
lifecycle, `$HOME` isolation, permission auto-approve, and template-asset
rewriting) is documented in the code comments of `test-e2e/`, starting with
`harness.ts` and `mock-server.ts`.

## Prerequisites

Two things must be present, or the suite fails loudly before any test runs:

1. **The `opencode` binary on `PATH`.** The `globalSetup`
   (`test-e2e/global-setup.ts`) shells out to `opencode --version` and exits
   non-zero with a clear message if it is missing. The suite is developed
   and tested against opencode `1.17.8`.
2. **A built `build/` directory.** The plugin loads from `build/index.js`
   via a `file://` URL (opencode resolves `package.json#main`), so run
   `pnpm build` first. The same guard checks `build/index.js` exists.

No API keys, no network, and no `OPENAI_API_KEY` are required — every LLM
call is served by an in-process mock.

The suite is **not part of `pnpm check`** (the CI gate) — `vitest.config.ts`
excludes `test-e2e/**/*.e2e.test.ts`, so CI never needs the `opencode`
binary. The one exception is `test-e2e/mock-server.test.ts`, a standalone
unit test for the mock that runs under `pnpm test` like any other.

## How to run it

```shell
pnpm build              # build the plugin into build/
pnpm test:e2e           # run the whole e2e suite
```

To run a single file or test while iterating:

```shell
pnpm test:e2e -- test-e2e/command.e2e.test.ts
pnpm test:e2e -t "writes a single scripted file"
```

The e2e config (`vitest.test-e2e.config.ts`) uses a 60s test timeout and a
30s hook timeout — each test spawns its own `opencode` server, which takes a
few seconds to boot.
