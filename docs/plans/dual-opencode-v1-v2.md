# Dual-Support Plan: opencode V1 + V2

Status: implemented
Date: 2026-09-22
Verified against: opencode 1.18.29 and 1.18.32 (V1), 2.0.14 (V2)

`opencode-sdd` must keep working on opencode V1 and start working on
opencode V2 from one published package. This document records why the
change is needed, the facts it rests on (all verified), the target
architecture, and the phased work to get there.

## 1. Why this change

opencode V2 (2.0.0 on 2026-09-11, 2.0.14 at the time of writing) replaced
the plugin API. A V1 plugin implementation does not run in V2: the V2
loader decodes the default export as `{ id, setup }` or `{ id, effect }`
and rejects the current function export with

```text
Plugin must export a default definition with an id and an effect or setup function.
```

V2 then logs a warning and continues, registering nothing — no commands,
no agents, no `sdd-command` tool, no permissions. V1 is still actively
released (1.18.32), so abandoning it is not an option.

The change is possible because the V1 line already ships the V2
compatibility surface: `@opencode-ai/plugin` 1.18.29 exposes
`./v2/promise` with `define`, `Plugin { id, setup }`, and
`PluginContext`. A default export object carrying both `server` (V1) and
`setup` (V2) is accepted by both hosts, so one package can serve both.
The install CLI must enforce a V1 floor of 1.18.29.

## 2. Verified facts

Each fact below was verified by inspecting the published packages and by
running the real binaries in Docker (see Appendix A). Facts marked
*corrected* differ from the initial draft of this plan.

### 2.1 Host dispatch

| Fact | Evidence |
| --- | --- |
| V1 1.18.29 accepts `{ id, server, setup }`, calls `server()` | Live run: `server()` marker written, `config` hook registered a command, `GET /command` returned it |
| V1 1.18.29 does **not** call `setup()` on that entry | Live run: `setup()` marker never written *(corrected)* |
| V2 2.0.14 accepts the same object, calls `setup(ctx)` only | Live run: `setup` received `app, location, options, agent, aisdk, command, event, experimental, generate, model, provider, integration, mcp, permission, plugin, reference, rpc, skill, storage, tool, vcs, websearch, worktree, session, shell` |
| V2 loader requires `id` + `setup`/`effect`; extra keys are ignored | `@opencode/core` loader schema; live load succeeded with the extra `server` key |
| V1 1.18.29 `PluginContext` lacks `app`, `tool`, `permission`, `provider` | `@opencode-ai/plugin@1.18.29` types |
| V2 `PluginContext` has all of the above plus `app` | `@opencode/plugin@2.0.14` types |

Consequence: `setup` must guard against a non-V2 context defensively
(null-safe `isV2Host(ctx)`), but V1 dispatch is by export name — the
guard is not load-bearing on 1.18.29.

### 2.2 V2 plugin API shapes

| Fact | Evidence |
| --- | --- |
| `AgentEditor` has `list/get/default/update/remove`, no `add` | `@opencode/plugin` types |
| `update(missingId)` **creates** the agent | Live run: 7 built-ins → 8 with `probe-agent` added, no error |
| `Agent.Info` uses `system` (not `prompt`), plus `mode`, `hidden`, `model`, `steps`, `permissions` | `@opencode/schema` types |
| `CommandEditor.add({ name, description, execute })`; `Command.Info` has no template/agent | Types; live `add` registered without error |
| `CommandInvocation` is `{ sessionID, prompt, delivery }`; `delivery` is `steer` or `queue` | `@opencode/plugin` types |
| `ToolEditor.add` accepts JSON Schema, Effect Schema, or Standard Schema input | `Tool.ValueSchema = Schema.Codec \| StandardSchemaV1 \| JsonSchema.JsonSchema` |
| Tool `execute` must return an `Effect`, not a Promise | `Tool.Info.execute: (input, context) => Effect.Effect<Result, Error>` *(corrected)* |
| Tool result is `{ output?, content?, metadata? }` | `@opencode/schema` types |
| Permission domain is `list/get/reply` plus a `hook('evaluate')`; `Permission.Effect` is `allow\|deny\|ask` | `@opencode/plugin`, `@opencode/schema` types |
| Config has `plugins`, `agents`, `permissions` (ruleset) keys | `@opencode/schema` config types |
| `ctx.app` is `{ name, version, channel }` — no logger | `@opencode/plugin` `app.d.ts` |

### 2.3 Packaging and local resolution

| Fact | Evidence |
| --- | --- |
| V2 resolves a local directory by trying `<dir>/server` then `<dir>/index`; it ignores `package.json#main` | `@opencode/plugin/host.js`; live load of `/plug-dual` → `/plug-dual/index.js` |
| V2 rejects a configured local **file** path (`configured plugin path must be a directory`) | `@opencode/core` supervisor code *(corrected: it is a warning, not a load error)* |
| V1 resolves a local directory through a package entry point (a `package.json` with `main`/`exports`); a directory with only `index.js` does not resolve | Live run: `/plug` with `main` loaded; `/plug-nopkg` (only `index.js`) did **not** load *(corrected)* |
| There is no single local directory target that works on both hosts | Combination of the two facts above: root works on V1 only, `build/` on V2 only *(corrected)* |
| V2 npm-package resolution uses the package name, so `exports`/`main` apply | `Host.resolve` with `target.name`; not yet tested end to end |
| `@opencode/sdk.create({ config, database, plugins })` exists for an in-process host | `CreateOptions` extends the embedded-host `ServerOptions` and adds `plugins?: Plugin.Plugin[]` |
| `@opencode/cli@2.0.14` installs bins `opencode` and `opencode2` | package metadata; both are the V2 binary |
| `--standalone` is a **global** flag, not a `serve` flag; V2 `serve` prints a generated server password; log levels are lowercase | Live `opencode2` runs *(corrected)* |

Consequence: the e2e V1 lane keeps `file://<repo-root>`; the V2 loader
lane points at `file://<repo-root>/build`; the install CLI writes the
form matching the detected host. A root shim (`index.js` re-exporting
`build/index.js`) is the alternative if a single local entry is ever
needed; it is not required if the entry is host-specific.

### 2.4 Load timing

V2 plugins load when a location/instance boots (a session or `run`), not
when `serve` starts. A loader smoke test that only starts `serve` will
pass vacuously; it must trigger a session. *(corrected)*

## 3. Goal and scope

Goal: the full SDD surface — 11 commands, 6 hidden agents, the
`sdd-command` tool, and permission gating — works on opencode V1 ≥
1.18.29 and V2 2.0.x, with automated e2e and manual QA covering both
versions.

Explicitly unchanged: bundled asset Markdown, frontmatter parsers, the
template rewriter, the mock LLM server, and most Gherkin scenario bodies.

## 4. Runtime architecture

Add a host adapter layer below the entry point. Sibling adapters never
import each other; shared code lives at the `host/` level.

```text
src/
├── index.ts                     # dual default export { id, setup, server }
├── host/
│   ├── index.ts                 # barrel
│   ├── detect.ts                # isV2Host(ctx): null-safe capability check
│   ├── surface.ts               # buildSurface(logger): dirs + agents + commands + tool core
│   ├── v1/
│   │   ├── index.ts             # createV1Hooks(surface, logger): Hooks
│   │   ├── commands.ts          # config.command registration
│   │   ├── agents.ts            # config.agent registration
│   │   ├── permissions.ts       # global sdd-command deny + external_directory grant
│   │   ├── tool.ts              # legacy args fragment + ToolDefinition cast
│   │   └── logger.ts            # client.app.log adapter
│   └── v2/
│       ├── index.ts             # registerV2(ctx, surface, logger)
│       ├── agents.ts            # AgentConfig → Agent.Info mapping + upsert
│       ├── commands.ts          # template → execute closure
│       ├── permissions.ts       # evaluate hook + per-agent transforms
│       ├── tool.ts              # JSON Schema input + Effect wrapper + { content }
│       └── logger.ts            # console adapter
├── sdd-command/
│   ├── index.ts                 # barrel
│   ├── core.ts                  # neutral { description, inputSchema, execute }
│   ├── allowlist.ts             # unchanged
│   └── source-loader.ts         # unchanged
├── agents/ commands/ utils/     # loaders unchanged; Logger port stays in utils
```

Entry shape:

```ts
const sddPlugin = {
  id: 'opencode-sdd',
  async server(input: PluginInput): Promise<Hooks> {
    const logger = createV1Logger(input.client);
    return createV1Hooks(await buildSurface(logger), logger);
  },
  async setup(ctx: PluginContext): Promise<void> {
    if (!isV2Host(ctx)) return; // defensive; V1 does not call setup today
    const logger = createV2Logger();
    await registerV2(ctx, await buildSurface(logger), logger);
  },
};

export default sddPlugin;
```

Rules preserved: no runtime `@opencode-ai/*` or `@opencode/*` imports in
the plugin graph (V2 types via `import type` from `@opencode/plugin`, a
type-only devDependency); the `config`/`setup` paths never throw; the
plugin degrades gracefully if a registration step fails.

## 5. Dependencies and build gates

- Add `@opencode/plugin` 2.0.14 (type-only, `devDependencies`), pinned in
  lockstep with the V2 binary.
- Extend `scripts/check-runtime-imports.mjs` from `@opencode-ai/` to
  `@opencode(?:-ai)?/` so a leaked V2 value import fails the build;
  `build/cli/` stays exempt.
- `src/cli/manifest.test.ts` gains assertions for the new dependency
  placement (the plan draft called this file `src/manifest.test.ts`).
- Two version lines stay in sync: V1 (`@opencode-ai/sdk`,
  `@opencode-ai/plugin`, binary pins) and V2 (`@opencode/plugin`,
  `@opencode/sdk`, `@opencode/cli`). AGENTS.md lists both.

## 6. Install CLI

Today the CLI prints `opencode ${detected.version} detected` and discards
it (`src/cli/install.ts:492-497`); `detect()` does no parsing
(`src/cli/prerequisites.ts:63-74`); every config path is V1 (`plugin` key
in `src/cli/config-patcher.ts`, `agent.<name>.model` in
`src/cli/agent-model-patch.ts`, V1 SDK probe in `src/cli/model-probe.ts`).

Changes:

- Parse `DetectResult` into `{ raw, major, minor, patch }`; keep `ok`
  semantics.
- Refuse V1 < 1.18.29 with a clear message (object entrypoints); write
  V2-native shapes for V2 (`plugins`, `agents`, `permissions`).
- Plugin entries: V1 local form `file://<root>`; V2 local form
  `file://<root>/build`; npm forms (bare `opencode-sdd`,
  `opencode-sdd@<spec>`) unchanged.
- V2 model probe: spawn `opencode2 serve` and use the printed password,
  or use `@opencode/sdk`; failure stays soft.
- V2 auth env names if they differ; tests for detect/patch/entry/probe.

## 7. E2E strategy

Split host bootstrap from specs:

```text
test-e2e/
├── shared/          # mock LLM, scenarios, host facade, fixtures
├── v1/              # today's harness (binary + file://<root>), global setup asserts 1.x
├── v2/              # @opencode/sdk create() in-process lane
│                    # + loader smoke spawning the real opencode2 binary
└── *.e2e.test.ts    # specs routed through the host facade, selected via E2E_HOST
```

- The V2 loader smoke must trigger a session (`run`), not just `serve`.
- The in-process lane imports the plugin object directly and passes it in
  `create({ config, database, plugins })`, so it bypasses the V2 config
  loader — that is what the loader smoke is for.
- The V1 global setup asserts a 1.x binary (fixes today's any-version PATH
  lookup).
- Two vitest configs share the include glob; scripts `test:e2e:v1`,
  `:v2`, `:all`. The config file is `vitest.test-e2e.config.ts`.
- CI: V1 keeps the 3-OS matrix; V2 in-process lane joins it binary-free;
  an ubuntu lane runs the loader smoke against `@opencode/cli`.

## 8. Manual QA strategy

The QA stack is single-version in every layer (image, compose project,
`ARG OPENCODE_VERSION=1.18.29` at `qa/Dockerfile:31`, `plugin:
["file:///app"]` in `qa/docker/wire-opencode-config.sh`, V1 serve flags
in `qa/docker/serve-web.sh`, hardcoded compose file/service in
`qa/scripts/bdd/run-tests.ts`, report schema with no version field).

- Image: `qa/Dockerfile` gains `ARG OPENCODE_MAJOR` and both version
  args; installs V1 or V2 and bakes the version as a label.
- Stacks: per-version compose overrides setting project name, image tag,
  volume names, build args, and offset ports; `qa-up.sh` gains
  `--env v1|v2` (default v1).
- Config wiring: V1 keeps `plugin: [file:///app]`; V2 writes
  `plugins: [file:///app/build]`, the provider shape, and permissions.
- In-container scripts: `serve-web.sh` branches on version. Note that V2
  `serve` does not accept `--standalone` (global flag), prints a server
  password, and uses lowercase log levels.
- Runner: `--env`, parameterized compose project/service, report fields
  `environment`, `opencodeVersion`, `image`; run id `<date>-<env>`.
- Features: `@V1`/`@V2` applicability tags (checker + gherkin-lint
  accept them); P0 registration/tool/short-flow/prd-flow/orchestrator
  runs on both versions.
- Skills and `qa/README.md` document both stacks, both prerequisite
  versions, and mandatory versioned evidence.

Operational note: the locally built `opencode-sdd-qa:workspace` image is
stale (opencode 1.18.23); any QA run must rebuild it from the updated
Dockerfile.

## 9. Documentation and policy

Update AGENTS.md (structure, plugin surface, two-line version sync,
build guard), DEVELOPMENT.md, `docs/e2e.md`,
`docs/reference/install-cli.md`, README supported versions,
`qa/README.md`, and CHANGELOG (user-facing entries only).

## 10. Change inventory

| Area | New | Modified |
| --- | --- | --- |
| Runtime | `src/host/**`, `sdd-command/core.ts` | `src/index.ts`, `sdd-command/definition.ts`, `utils/logger.ts` |
| Build/deps | `@opencode/plugin` devDep | `package.json`, runtime-imports guard, manifest test |
| Unit tests | `host/**/*.test.ts` | entry tests move under `host/v1/` |
| CLI | V2 probe module | prerequisites, install, plugin-entry, config-patcher, agent-model-patch, model-probe, server-auth, tests |
| E2E | host facade, V2 lanes | specs, configs, CI, Dockerfile |
| QA | compose overrides, env selection | Dockerfile, qa-up, wire-config, serve-web, runner, features, skills, README |
| Docs | this plan | AGENTS.md, DEVELOPMENT.md, README, install-cli, CHANGELOG |

## 11. Phases

| Phase | Work | Exit criteria |
| --- | --- | --- |
| 0. Spikes | Done: dual entry on both hosts, agent upsert, command add, local resolution, loader error. Remaining: tool gating action, template-read grant, command dispatch semantics, question flow, V2 probe, npm resolution | Findings recorded in this document (see Implementation notes); remaining spikes closed |
| 1. Dual entry | `host/` skeleton, surface, dual entry, move V1 registration + tests, defensive guard | V1 unit + e2e green, behavior unchanged |
| 2. V2 adapter | agents, commands, tool (Effect wrapper), permissions, logger; ctx-stub tests | `pnpm test` covers both adapters; Docker smoke on V2 |
| 3. Install CLI | version parsing, V2 shapes, V2 probe, floor enforcement, tests | Wizard works on V1 and V2 |
| 4. E2E | host facade, lane split, V2 in-process + loader lanes, CI | Both lanes green in CI |
| 5. Manual QA | dual stacks, wiring, serve-web, runner metadata, tags, skills | P0 suite run and recorded on both versions |
| 6. Docs/release | docs, policy, changelog, pins | `pnpm check` + both e2e lanes + canary |

## 12. Risks and mitigations

1. Agent upsert is undocumented — verified on 2.0.14 (7→8); isolated in
   `host/v2/agents.ts`; fallback: the CLI materializes agent files.
2. Custom-tool gating in V2 permissions is unverified — Phase 0;
   fallback: `permission.hook('evaluate')`.
3. Command dispatch semantics may not map 1:1 to V1 — Phase 0;
   differences documented and covered by QA.
4. Local plugin resolution differs per host — host-specific entries;
   root shim if a single entry is ever required.
5. V2 model probe adds CLI runtime deps — prefer spawn+fetch with the
   generated password; degrade to defaults.
6. Two version lines to keep in sync — AGENTS.md lists both pins and
   both test fixtures.
7. QA cost doubles — applicability tags + P0-on-both policy.

## 13. Definition of done

- One published package whose entry registers the identical SDD surface
  on V1 ≥ 1.18.29 and V2 2.0.x.
- `pnpm check` green; e2e V1 and V2 lanes green in CI; V2 loader smoke
  green against the real binary.
- Install wizard works on both, writes native config, and refuses
  unsupported V1.
- Manual QA P0 executed on both environments with versioned reports.
- AGENTS.md, DEVELOPMENT.md, e2e docs, install CLI reference, README,
  QA README, and CHANGELOG all reflect dual support.

## Appendix A: verification method

Packages inspected from the npm registry: `@opencode-ai/plugin` 1.18.29
and 1.18.32, `@opencode/plugin`, `@opencode/sdk`, `@opencode/client`,
`@opencode/schema`, `@opencode/core`, `@opencode/server`, and
`@opencode/cli` 2.0.14.

Live runs used the host Docker engine:

- V1: `curl -fsSL https://opencode.ai/install | bash -s -- --version
  1.18.29 --no-modify-path`, then `opencode serve` with
  `OPENCODE_CONFIG_CONTENT` pointing at a test plugin.
- V2: `npm i -g @opencode/cli@2.0.14`, then `opencode2 run "hello"
  --standalone --print-logs` with a global `opencode.json` containing
  `plugins: ["file:///<dir>"]`.

Test plugins recorded markers from `server()`, `setup(ctx)`, agent
transforms, and command registration; `GET /command` and the server logs
confirmed registration. No repository files were modified during
verification.

## Appendix B: implementation notes

Facts discovered while implementing the plan (verified against
opencode 2.0.14 unless stated otherwise; they complement section 2):

- **Tool gating.** V2 decides tool visibility from the agent's
  permission ruleset (`snapshot(permissions)` in `@opencode/core`): a tool
  whose effective rule is `{ resource: "*", effect: "deny" }` is excluded
  (`whollyDisabled`). Rules evaluate last-match-wins
  (`findLast` over `match(action, rule.action) && match(resource,
  rule.resource)`). The V2 adapter therefore appends the global
  `sdd-command` deny to non-SDD agents and the frontmatter rules to SDD
  agents; no `permission.hook('evaluate')` is needed (the hook is not
  consulted for tool execution).
- **Direct tool exposure.** Plugin tools default to CodeMode
  (`options.codemode !== false`), which wraps them in the `execute` tool.
  `options: { codemode: false, permission: 'sdd-command' }` exposes
  `sdd-command` directly and gives it the V1 permission action. Tool
  results must be `{ content }` (not `{ output }`) unless an output schema
  is declared.
- **Template inlining.** V2 does not inline `@<abs-path>` mentions in
  session prompts (verified with the real binary), so the V2 command
  adapter inlines the referenced template file content itself
  (`src/commands/template-inliner.ts`). V1 keeps the rewrite-only path.
- **Permission mapping.** V2 action names differ: `bash` -> `shell`,
  `task` -> `subagent`; `external_directory` resource globs are reported
  as `<dirname>/*` and the matcher lets `*` cross `/`.
- **Command dispatch.** `session.command({ sessionID, name, text })`
  invokes a plugin command's `execute(invocation)`; the adapter sends the
  template with `$ARGUMENTS` substituted through
  `session.prompt({ sessionID, text })`.
- **Provider config shape.** V2 uses `providers.<id>.package` +
  `settings` (not `npm` + `options`) and has no `disabled_providers`
  equivalent. `model` accepts the `provider/model` string form.
- **Project resolution.** The `opencode2` CLI resolves its project from
  the `PWD` environment variable, not the process working directory:
  spawning it with only `cwd` boots the parent's project.
- **Loader smoke timing.** V2 loads plugins when a location boots, so a
  smoke must trigger a session (`run`). Because the mock LLM runs in the
  same vitest worker, the smoke spawns asynchronously — a `spawnSync`
  blocks the worker's event loop and starves the mock.
- **In-process host.** `OpenCode.create({ plugins })` registers host-wide
  plugins; a location's instance (and with it `setup`) materializes on the
  first capability-dependent call. `agent.list` returns no entries until
  then; `agent.get({ agentID, directory })` works after a
  `command.list({ location: { directory } })` acquisition. The public
  `command.list` API does not expose host-wide plugin commands, so command
  registration is asserted through dispatch behavior and the loader smoke.
- **V2 probe.** `opencode serve --port 0` prints
  `server listening on http://...`; with `OPENCODE_SERVER_PASSWORD` set,
  `/api/model` and `/api/model/default` answer with Basic auth. The model
  catalog can be empty immediately after boot, so the CLI probe polls.
- **V2 logger.** The V2 stdio server owns stdout, so plugin diagnostics
  must go to stderr (`console.error`); `console.log` is swallowed.
- **Auth env names.** Both hosts use
  `OPENCODE_SERVER_PASSWORD`/`OPENCODE_SERVER_USERNAME`, so
  `src/cli/server-auth.ts` needed no change; the V2 probe generates its own
  password and overrides any inherited value.
- **Surface build timing.** The V1 `config` hook rebuilds the surface on
  every invocation (preserving per-invocation `SDD_*_DIR` overrides, which
  existing unit tests pin); V2 builds it once per location boot in `setup`.
  The entry's `server()` therefore returns the hooks without loading assets.
- **`sdd-command/definition.ts` replaced.** The neutral core moved to
  `sdd-command/core.ts` and the V1 `ToolDefinition` adapter to
  `host/v1/tool.ts`, matching the plan's target structure (`host/v1/tool.ts`
  owns the legacy args fragment + cast).
- **E2E lane split deviation.** The lanes use separate vitest configs
  (`vitest.test-e2e.config.ts` / `vitest.test-e2e-v2.config.ts`) instead of
  one config switching on `E2E_HOST`, and V2 has dedicated specs instead of
  routing the V1 specs through a host facade: V2's client API and config
  surface differ enough that re-routing would have rewritten every spec
  without adding coverage. The V1 specs remain in `test-e2e/*.e2e.test.ts`
  and the shared/v1/v2 directory split matches the plan.
- **V2 subagent catalog and `hidden`.** V2's subagent tool builds the
  catalog it shows the model with an explicit `!agent.hidden` filter
  (`model-resolver-4skav2s8.js`), so a hidden agent is callable by id but
  never advertised. The V2 agent adapter therefore does not map the
  frontmatter `hidden` flag: the SDD agents register non-hidden, and
  `mode: 'subagent'` keeps them out of primary/default selection. V1 keeps
  `hidden: true`.
- **V2 command precedence.** The host's `opencode.config.command` plugin
  registers in the internal `post` group, after external plugins, and
  `editor.add` is a last-write-wins `Map.set`; a user-config command of the
  same name therefore shadows an SDD command on V2 and no collision warning
  is emitted. Accepted as host precedence and recorded in `qa/README.md`
  section 3.4 and TC-REG-04.
- **V2 agent model scope.** `Agent.Info.model` is consumed by the subagent
  tool (`input.model ?? agent.model ?? parent.model`) and by config-command
  subagent dispatch, but not by primary sessions, whose model resolves from
  `session.model` or the global default. An SDD agent's configured model is
  therefore honored on the delegation path only; the adapter does not
  compensate.
