# End-to-End Test Suite

The `test-e2e/` suite exercises the `opencode-sdd` plugin against a **real
opencode host** on both supported lines, driven by a **local mock
OpenAI-compatible LLM** built on `node:http` + SSE. It is fully offline,
needs no API keys, and is deterministic — consecutive runs are
byte-identical.

Unit tests (`src/**/*.test.ts`) cover the plugin's internals in isolation;
this suite covers what only surfaces when opencode actually loads the
plugin and runs a command end to end — command registration, dispatch
through the agent loop, the `write` tool executing, and bundled template
assets reaching the model prompt.

The suite is split into two lanes and a shared layer:

```text
test-e2e/
├── shared/          # mock LLM, scenarios, host-neutral harness pieces
├── v1/              # real 1.x binary lane (server + file://<root>)
├── v2/              # in-process @opencode/sdk lane + real opencode2
│                    # loader smoke
└── *.e2e.test.ts    # V1 spec files (registration, commands, flows)
```

## Prerequisites

The plugin build (`pnpm build`) is always required: both lanes load the
compiled plugin, and `test-e2e/*/global-setup.ts` fails loudly with a
clear message when `build/index.js` is missing.

The lanes differ in what else they need:

- **V1 lane** (`pnpm test:e2e:v1`) needs an **opencode 1.x binary on
  PATH**. The global setup shells out to `opencode --version` and asserts
  the major is `1`, so a V2-only machine fails with an actionable message
  instead of confusing config-shape errors. On macOS `brew install
  opencode` works; on any platform (including Windows)
  `npm install -g opencode-ai@1.18.29` works.
- **V2 lane** (`pnpm test:e2e:v2`) runs the in-process specs with only
  `@opencode/sdk` (a devDependency) — no binary needed. The loader smoke
  additionally spawns the real `opencode2` binary
  (`npm install -g @opencode/cli@2.0.14`) and **skips itself** with a
  clear message when that binary is absent, so the lane is usable on any
  machine and fully covered in CI.

No API keys and no network are required — every LLM call is served by an
in-process mock.

The suite is **not part of `pnpm check`** (the CI gate): `vitest.config.ts`
excludes `test-e2e/**/*.e2e.test.ts`. The host-neutral unit tests
(`shared/mock-server.test.ts`, `v1/harness.test.ts`) still run under
`pnpm test`.

## How to run it

```shell
pnpm build        # build the plugin into build/
pnpm test:e2e     # both lanes (v1 then v2)
pnpm test:e2e:v1  # V1 lane only
pnpm test:e2e:v2  # V2 lane only
```

To run a single file or test while iterating:

```shell
pnpm test:e2e:v1 -- test-e2e/command.e2e.test.ts
pnpm test:e2e:v2 -- test-e2e/v2/registration.e2e.test.ts
pnpm test:e2e:v1 -t "writes a single scripted file"
```

Both configs use a 240s test timeout and a 240s hook timeout. Server
startup dominates wall-clock on a loaded Windows CI runner, so each V1
e2e file shares **one** opencode server across its `describe` block via
`beforeAll`/`afterAll` rather than spawning a fresh server per test. File
parallelism is disabled on Windows to keep cold starts inside the
timeout; Linux/macOS keep parallelism.

## V1 lane

The V1 lane is the original suite. `test-e2e/v1/harness.ts` starts a real
opencode 1.x server through `createOpencodeServer` with the plugin
registered as `file://<repo-root>` (V1 resolves `package.json#main`), and
every spec drives it through the SDK client and the raw `/question` API.
`test-e2e/v1/prd-auto-implement-helpers.ts` holds the shared session and
question helpers for the orchestrator specs.

## V2 lane

The V2 lane covers the same surface through V2's own mechanisms:

- `v2/registration.e2e.test.ts` runs an in-process host
  (`OpenCode.create({ plugins: [sddPlugin] })`) and asserts the six
  hidden subagents and their mapped permission rules (including the
  `bash` -> `shell` and `task` -> `subagent` aliases and the global
  `sdd-command` deny).
- `v2/command.e2e.test.ts` dispatches a real plugin command and asserts
  the mock LLM receives the inlined, argument-substituted template.
- `v2/sdd-command-tool.e2e.test.ts` lets a worker agent call
  `sdd-command` (asserting the loaded command comes back) and shows a
  non-SDD agent cannot see the tool at all.
- `v2/loader-smoke.e2e.test.ts` spawns the real `opencode2` binary with
  the plugin configured as `file://<repo>/build` and asserts the
  registration log lines. V2 loads plugins when a location boots, so the
  smoke triggers a `run`; `serve` alone would pass vacuously.

Three V2 behaviors shape the harness and are worth knowing before editing
these tests:

- **Project resolution uses `PWD`, not the spawn `cwd`.** The loader
  smoke passes `PWD=<temp project>` explicitly; without it the CLI boots
  the parent's project.
- **A location's instance materializes on the first
  capability-dependent call.** Registration assertions poll `agent.get`
  until the plugin's registrations are visible instead of racing
  construction.
- **`command.list` does not expose host-wide plugin commands.** Command
  registration is asserted through dispatch behavior and the loader
  smoke's log lines instead.

## Mock LLM and scenarios

`shared/mock-server.ts` serves `/v1/chat/completions` (SSE) and
`/v1/models`; each request consumes one scripted turn and the raw request
body is captured for assertions. `shared/scenarios.ts` (plus its
`cross-cutting` and `resume` re-exports) builds the turn scripts the V1
specs use; the V2 specs reuse `sddCommandScenario`.

## Permissions and isolation

Both lanes isolate opencode's global dirs (`HOME`, `XDG_*`) in a fresh
temp directory and strip inherited `OPENCODE_SERVER_*` auth variables, so
runs never read or write the developer's own opencode state and can run
in parallel. File writes are auto-approved through config
(`permission` on V1, `permissions` on V2), which is the only mechanism
the suite needs.

## Template assets

V1 inlines `@<abs-path>` mentions natively, so the V1 adapter rewrites the
portable `@opencode-sdd-templates/` token to an absolute path. V2 does not
inline mentions in session prompts, so the V2 adapter inlines the
referenced file content itself. Both paths are asserted: the V1
`command.e2e.test.ts` checks the inlined heading, and the V2
`command.e2e.test.ts` checks the same heading after inlining.

## CI

`.github/workflows/ci.yml` runs the V1 lane on the ubuntu/macos/windows
matrix and the V2 lane on ubuntu (with `@opencode/cli` installed so the
loader smoke executes). The repo `Dockerfile`'s `e2e-test` stage runs
`pnpm test:e2e:all` with both binaries available.
