# Manual QA — opencode-sdd (Gherkin plan + bifrost stack)

This is the manual QA suite for
[opencode-sdd](https://github.com/opencode-ai/opencode-sdd). It runs the
plugin's real flows against **real frontier models** through
[bifrost](https://github.com/maximhq/bifrost) (a thin AI gateway) with the
[OpenRouter](https://openrouter.ai) provider: PRD/SDD flows need a model
strong enough to produce meaningful plans, and prompt behavior varies
across frontier families. The gateway IS local (compose service
`bifrost`); the inference is remote and **costs real OpenRouter
tokens** — follow the token guidance in section 9.

The test cases are **Gherkin feature files** in `qa/features/`, run by
the interactive manual test runner (`qa/scripts/bdd/run-tests.ts`, via
`pnpm qa:run`), which writes a per-run report to `qa/output/`. The
plans are enforced as code: `pnpm lint:gherkin` (part of `pnpm lint`)
validates the `@TC-*` ID convention and Gherkin syntax.

Everything needed to run the suite:

| Path | Purpose |
| --- | --- |
| `qa/docker-compose.yml` | Bifrost gateway (OpenRouter) + isolated workspace container |
| `qa/docker-compose.ports.yml` | Opt-in host-port override for the gateway (UI + host-side smoke) |
| `qa/.env.example` | Template for the gitignored `qa/.env` (OpenRouter key + optional host port) |
| `qa/bifrost/models.tsv` | The canonical OpenRouter model allowlist (id + display name) |
| `qa/features/` | Gherkin test plans, one file per group (section 4) |
| `qa/scripts/bdd/` | The manual test runner (`run-tests.ts`) and ID check (`check-gherkin-ids.ts`) |
| `qa/scripts/setup/` | Host-side scripts: stack/gateway lifecycle, prereq check, key contract |
| `qa/docker/` | In-container scripts (baked into the image at `/app`): provisioning, post-provision verification, scratch project, config wiring, baseline reset, web-UI server launcher (`serve-web.sh`), wizard PTY driver, smoke test |
| `qa/output/` | Generated run reports (`qa/output/<run-id>/report.json` + `report.md`) — gitignored |
| `qa/.gherkin-lintrc` | Gherkin style rules (used by `pnpm lint:gherkin`) |
| `qa/README.md` | This document: environment, case conventions, runner usage, criteria |

## 1. Purpose and Scope

### 1.1 What the plan verifies

This plan verifies the **user-visible behavior** of the plugin against a
real opencode session and a real LLM:

- The install wizard CLI end to end (interactive, `--yes`, failure paths).
- Plugin registration: commands, agents, permission grants, config merging.
- The short SDD flow, the PRD long flow, and the `prd-auto-implement`
  orchestrator: artifact lifecycle, status transitions, finalization.
- The `sdd-command` tool and the doc-maintenance commands.
- Failure paths: missing artifacts, missing prerequisites, gateway down,
  malformed config, missing asset directories.
- Cost sanity: tokens/cost per step, context fit, thinking-mode
  trade-off. **Plan and artifact QUALITY on strong models, and prompt
  compatibility across different frontier families** (each run-group can
  be repeated under a different model, see 5).

### 1.2 What the plan does NOT cover

- Deterministic mechanics already proven by `pnpm test:e2e` (mock LLM):
  template-token rewriting, `sdd-command` allowlist error strings,
  permission-map merging, loop caps and escalation order, config-hook
  idempotency. Manual runs re-check a few of them cheaply, marked
  "sanity" in the features.
- Model quality benchmarks. What the plan DOES do is record which model
  each run used and flag artifact quality visibly for the human reviewer.
- TUI keyboard aesthetics.

### 1.3 Priorities

Every scenario carries a priority tag:

| Tag | Meaning |
| --- | --- |
| `@P0` | Blocking: must pass before the plugin can be considered working |
| `@P1` | Core: must pass before a release |
| `@P2` | Nice-to-have: quality, cost, and edge-case checks |

## 2. Test Case Format (Gherkin)

Plans live as Gherkin `*.feature` files in `qa/features/` — one file
per area. Each scenario uses the same anatomy so results are
comparable:

- `Given` — preconditions (state required before the case starts).
- `When` — concrete actions, including exact commands and inputs.
- `Then` — explicit assertions; each one must hold for the case to
  pass.
- Evidence — every scenario ends with an "I keep ... in the evidence
  folder" step so the tester records artifacts per case (see 7).
- `Background:` — shared preconditions for the whole file.
- `Scenario Outline` + `Examples:` — table-driven variants; each
  examples row is executed as a separate case by the runner, sharing
  the ID.

Every scenario carries exactly one ID tag of the form
`@TC-<GROUP>-<case>` — a semantic uppercase GROUP per file (e.g.
`@TC-REG-1`, `@TC-PF-6`). `qa/scripts/bdd/check-gherkin-ids.ts` (part of
`pnpm lint:gherkin`) enforces exactly-one-ID, per-file group
consistency, and uniqueness across the suite; `gherkin-lint` enforces
the style (kebab-case file names, no trailing spaces, `And` usage, and
so on).

### 2.1 Where tests run: the workspace container

ALL manual testing happens inside the `qa` workspace container - the
opencode session, the scratch project, the CLI wizard, and the configs
they patch never touch the host. The host runs only docker (plus, once,
an OpenRouter key) and holds this repo.

- `qa/scripts/setup/qa-up.sh` builds and starts both services (gateway +
  workspace, waits for gateway health, provisions the OpenRouter
  provider) and reads the OpenRouter API key from the gitignored
  `qa/.env` (or prompts for it) — nothing else is required on the host.
- The plugin source **and** its compiled `build/` are baked into the
  workspace image at `/app` (the Dockerfile runs `pnpm install &&
  pnpm build` itself, so changes to the plugin take effect after a
  rebuild, see 3.2).
- The scratch project lives in the `qa-work` volume at `/work`; opencode's
  own state (config, logs, history, cache) lives in `qa-home` at
  `/home/qa`; bifrost's config + request logs live in `bifrost-data`.
  `down -v` resets all three.
- Inside the workspace the gateway is always `http://bifrost:8080`
  (compose DNS) — no port mapping, no `localhost` confusion.

Shorthand used everywhere below (run from the repo root on the host):

```text
qa exec '<cmd>'    =  docker compose -f qa/docker-compose.yml exec -it qa \
                        bash -lc 'cd /work/sdd-manual && <cmd>'
```

`qa exec` allocates a TTY (`-it`) — the CLI wizard prompts need it
(the wizard is the only TTY-touching part of the suite). The opencode
session runs headless as `opencode serve`, which serves opencode's web
client; start it with `qa/docker/serve-web.sh` (no TTY needed) and
drive it from a browser (section 3.6). For a quick human eyeball the
TUI works too: `qa exec 'opencode --log-level DEBUG --print-logs'`.

**Sandbox-VM note (docker exec stdout):** in a sandbox VM
(`run-macos-sandbox.sh`), `docker exec` / `docker compose exec` stdout is
**dropped once the process idles** — a command that sleeps and prints
afterwards returns zero bytes. File writes are fine. So: run the
long-lived driver with `docker exec -d ... && docker exec ... cat
<logfile>` (fast, no idle), never rely on exec stdout for something that
pauses, and use `qa/docker/pty-driver.py`'s `--snapshot`/`--log` files
for anything scripted.

Copy evidence out of the container with:

```text
docker compose -f qa/docker-compose.yml cp qa:/work/sdd-manual/.sdd \
  qa/evidence/<date>/sdd-artifacts
```

## 3. Environment

### 3.1 Prerequisites

| Requirement | Where | Notes |
| --- | --- | --- |
| Docker engine | host | `docker info`; ~2 GB free (315 MB gateway image + ~1 GB workspace image) |
| OpenRouter API key | `qa/.env` (gitignored) | needed to START the stack; see 3.2 |
| Outbound HTTPS to `openrouter.ai/api/v1` | host (docker) | the gateway forwards every request there; checked by `check-deps.sh` |
| opencode binary 1.18.23 | image | `qa/Dockerfile` `ARG OPENCODE_VERSION` |
| Node 24, pnpm 10.14 | image + host | CLI wizard, scratch project; the runner needs `pnpm qa:run` on the host |
| git, python3, vim, curl | image | scratch project, config edits, smoke tests |
| Plugin source + `build/` | image | compiled by `qa/Dockerfile` from the repo context |

Run `qa/scripts/setup/check-deps.sh` once per machine; it exits non-zero and
names the missing item. Rebuilding the workspace bundle after plugin
changes: `docker compose -f qa/docker-compose.yml build qa`, then
restart — see 3.2.

### 3.2 Stack: OpenRouter gateway + workspace

```text
qa/scripts/setup/qa-up.sh      # build + start gateway and workspace, wait for health,
                               # provision the provider, VERIFY it end to end (group A
                               # checks folded in); refuses a stale workspace image
qa/scripts/setup/qa-shell.sh   # interactive shell inside the workspace
qa/scripts/setup/llm-up.sh     # gateway only: start/restart + wait
qa/scripts/setup/llm-down.sh   # gateway only: stop (container + volume kept)
qa/docker/llm-smoke.sh         # gateway only: model list, chat, tool call
```

- The stack is two containers (compose file `qa/docker-compose.yml`):
  `bifrost` (the OpenRouter gateway) and `qa` (the workspace). The
  gateway is provisioned at start time by `qa/docker/bifrost-provision.sh`
  via the management API — the repo checks in **no** bifrost
  `config.json`, so no key-shaped data ever lands in a file here (the
  key is referenced inside the gateway as `env.OPENROUTER_API_KEY`).
- Hermetic by default: the gateway publishes **no host port**, so the
  stack can never collide with host ports. All test traffic uses compose
  DNS inside the workspace (`BIFROST_BASE_URL=http://bifrost:8080` is
  already set in the `qa` environment).
- Host-side access (the bifrost Web UI, host-side smoke tests, and the
  opencode web UI for browser-driven runs) is an opt-in override:
  `QA_HOST_PORT=8080 qa/scripts/setup/qa-up.sh` (or put
  `QA_HOST_PORT=8080` in `qa/.env`; or, as plain compose: `docker
  compose -f qa/docker-compose.yml -f qa/docker-compose.ports.yml up
  -d`). The override publishes two host ports: the gateway
  `BIFROST_PORT` (default `8080`; set it to another value when 8080 is
  taken) and the opencode web UI `QA_WEB_PORT` (default `4097`, mapped
  to the container's 4096 — the `serve-web.sh` port; pick another value
  when 4097 is taken). Running the scripts without
  `QA_HOST_PORT`/`QA_WEB_PORT` always restores the hermetic state.
- macOS sandbox VM: even with the ports override, the published ports
  bind on the **host**, so host-side scripts, health checks, and the
  browser must use `http://192.168.64.1:<port>` (gateway `BIFROST_PORT`,
  web UI `QA_WEB_PORT`) instead of localhost. Inside the workspace
  container nothing changes (compose DNS).
- Plugin changes: `docker compose -f qa/docker-compose.yml build qa &&
  docker compose -f qa/docker-compose.yml up -d qa` — the image
  recompiles `build/` from the repo context. Prefer `qa-up.sh`, which
  cannot leave you on a stale image (see the next bullet).
- **Stale-image guard**: the image bakes the repo (plugin build +
  `qa/docker/` payload scripts), and `qa-up.sh` refuses to start when the
  image's `org.opencode-sdd.qa.src-hash` label (repo HEAD + working-tree
  diff baked by the Dockerfile) does not match the current repo — a stale
  image silently loses everything the suite needs (the `qa/docker/`
  payload scripts and the plugin build). Build through `qa-up.sh` (it
  passes the hash); manual
  `docker compose build qa` must export `QA_SRC_HASH`
  (`$(git rev-parse --short=12 HEAD):...`) or the label records `unknown`
  and the next `qa-up.sh` refuses. Escape hatch:
  `QA_ALLOW_STALE_IMAGE=1 qa/scripts/setup/qa-up.sh` (not recommended).
- **Post-provision verification**: after provisioning, `qa-up.sh` runs
  `qa/docker/verify-provision.sh` — provider active, key enabled with
  models, `/v1/models` contains the default, one smoke completion — and
  exits non-zero on failure. A provider created with **zero keys** leaves
  a "healthy" stack that serves 0 models; Group A checks are folded into
  bring-up so that cannot happen silently.
- Rebooting/stale state: `docker compose -f qa/docker-compose.yml down`
  removes the containers (volumes kept); `down -v` also removes the
  gateway data, scratch work, and opencode state.

#### The OpenRouter key: how it is passed safely

The key is a **runtime-only** value and never committed. The simplest
way is the gitignored `qa/.env` (created once from
`qa/.env.example`); the contract (`lib-openrouter-key.sh`) is:

```text
cp qa/.env.example qa/.env   # then fill in OPENROUTER_API_KEY=sk-or-...
```

- `qa/.env` is loaded by docker compose automatically (compose looks in
  the directory of the first compose file, `qa/`) and by the start
  scripts, so the same value reaches the bifrost container as its
  `OPENROUTER_API_KEY` environment variable, referenced by the provider
  setup as the literal string `env.OPENROUTER_API_KEY`. The value is
  never written to a committed file, a script, or the logs; the scripts
  never echo it.
- Alternatives, all equally acceptable:
    - `export OPENROUTER_API_KEY=sk-or-...` in your shell (one-off runs);
    - a key file kept OUTSIDE the repo (`OPENROUTER_KEY_FILE=/path/to/key`,
      useful when you cannot keep the key in the repo work tree);
    - let the script prompt (hidden input) in a terminal — the value is
      not stored anywhere.
- **Human-gated starts**: with **no** key source (no `qa/.env`, no
  `OPENROUTER_API_KEY`, no key file) and no TTY, the scripts refuse to
  start (see `qa/scripts/setup/lib-openrouter-key.sh`). This is
  deliberate — an automated agent or CI can not spin up a paid-inference
  stack unless the key is already in place on the machine, and the key
  is only ever in the environment of a process the human started.
- Restarts need no re-entry: `llm-down.sh` stops the container but keeps
  it (with its env) and the `bifrost-data` volume; `llm-up.sh` uses
  `docker compose start`, which does not re-evaluate the compose file
  (that would silently drop an unset key and break the provider).
- Full reset (`down -v`) removes the container and its env, so the next
  `qa-up.sh` uses `qa/.env` again (or prompts). `qa/.env` itself is
  never deleted by stack operations.

### 3.3 Scratch project

```text
qa exec '/app/qa/docker/scratch-init.sh /work/sdd-manual'
```

The script creates a small git repo (`src/math.ts` with `add`, vitest as
dev dependency, initial commit) with a local git identity for QA. Keep it
tiny on purpose: shorter reads and prompts mean fewer tokens — and with a
remote provider every token costs money. The project lives in the
`qa-work` volume, so it survives container restarts and is gone only
after `down -v`.

**Baseline reset between cases** (one command, call it from a case's
`Given` or `pnpm qa:run --case-reset`):

```text
qa exec '/app/qa/docker/reset-scratch.sh /work/sdd-manual'
```

It wipes `.sdd/`, re-initialises the git repo at its scaffold initial
commit (flow commits are discarded), and re-wires `opencode.json`
(`BIFROST_MODEL` passthrough works — export it to re-wire with a
different model). Flow state leaks between cases otherwise: a later case
can read an earlier one's artifacts, and wizard/agent leftovers in
`opencode.json` change what the next boot registers.
Chained groups (F/G, E/SF-2..4) reset ONCE at their first case and keep
artifacts between cases — the reset is not run mid-chain.

Fixtures (feature descriptions used by the cases):

| ID | Feature | Used in |
| --- | --- | --- |
| F1 | "Add `mul(a, b)` to `src/math.ts` following TDD." | Short flow |
| F2 | "Add `divide(a, b)` to `src/math.ts` that throws on division by zero. Single issue, no HITL." | PRD flow |
| F3 | F2 but the PRD must ask the human whether to throw or return `null` on division by zero. | HITL gate |
| F4 | "Update the docs of this scaffolding project." | Doc commands |

### 3.4 opencode configuration

```text
qa exec '/app/qa/docker/wire-opencode-config.sh /work/sdd-manual file:///app'
```

This writes `/work/sdd-manual/opencode.json` (the script picks up the
container's `BIFROST_BASE_URL` environment variable and the
`qa/bifrost/models.tsv` allowlist):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "bifrost": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://bifrost:8080/v1" },
      "models": {
        "openrouter/deepseek/deepseek-v4-flash": { "name": "DeepSeek V4 Flash", "tool_call": true },
        "openrouter/qwen/qwen3.5-plus-20260420": { "name": "Qwen 3.5 Plus", "tool_call": true },
        "openrouter/xiaomi/mimo-v2.5": { "name": "MiMo V2.5", "tool_call": true },
        "openrouter/google/gemini-3.1-flash-lite": { "name": "Gemini 3.1 Flash Lite", "tool_call": true },
        "openrouter/anthropic/claude-sonnet-5": { "name": "Claude Sonnet 5", "tool_call": true },
        "openrouter/openai/gpt-5.6-luna": { "name": "GPT-5.6 Luna", "tool_call": true }
      }
    }
  },
  "model": "bifrost/openrouter/deepseek/deepseek-v4-flash",
  "disabled_providers": ["opencode"],
  "plugin": ["file:///app"]
}
```

`file:///app` is the baked plugin inside the image. Restart opencode
after every config change (plugins load once at startup); no hot reload
exists.

Why the provider is shaped this way:

- One opencode provider (`bifrost`) talks to the gateway's
  OpenAI-compatible endpoint. The model ids are `openrouter/<slug>` —
  exactly what the gateway routes to OpenRouter (bifrost strips its own
  namespace and forwards the slug; opencode sends the config model key
  verbatim, so `openrouter/deepseek/deepseek-v4-flash` reaches
  OpenRouter as `deepseek/deepseek-v4-flash`).
- Six models from four families with distinct cost tiers; the order IS
  the wizard's enumeration order (see the allowlist file for why
  deepseek/qwen precede mimo/gemini: it matches the wizard's
  recommendation keywords).
- `disabled_providers: ["opencode"]` turns off opencode's built-in
  free-tier provider, which is loaded automatically whenever no explicit
  provider list is set. Leaving it on breaks two QA properties: requests
  can reach OTHER remote models (and the wizard would enumerate them),
  and its 7 models are listed ahead of the QA models everywhere — which
  pushes them below the CLI wizard's 7-item prompt fold and makes the
  wizard's `[recommended]` badges land on gateway models.

#### Model under test: switching it for a run

The global default is the first allowlist entry (`deepseek-v4-flash` —
cheap but strong). To run a group on a different frontier model, re-wire
with `BIFROST_MODEL` and restart the session:

```text
qa exec 'BIFROST_MODEL=anthropic/claude-sonnet-5 \
  /app/qa/docker/wire-opencode-config.sh /work/sdd-manual file:///app'
```

Then compare e.g. group E/F artifacts against the default run and record
the model in the evidence file (section 7). The allowlist entry the
provider key authorizes is unchanged — `BIFROST_MODEL` only picks which
of them opencode uses. All allowlisted models support tool calling
(every flow needs it; TC-LLM-02 proves it).

### 3.5 Diagnostics and evidence

- opencode server log (inside the container):
  `/home/qa/.local/share/opencode/log/opencode.log` — copy it out with
  `docker compose -f qa/docker-compose.yml cp qa:<path>
  qa/evidence/<date>/`.
- Session output: `qa exec 'opencode --log-level DEBUG --print-logs'`
  prints plugin markers; with `2>&1 | tee /work/session.log` you keep the
  transcript in the volume.

Plugin log markers (grep the captured `opencode.log`):

| Marker | Meaning |
| --- | --- |
| `plugin loading` | Config hook started |
| `loading SDD commands` | Command registration begins |
| `registered command` | One command registered (debug) |
| `SDD commands registered` | All commands done (info, with count; count 0 when the dir was unreadable) |
| `commands directory unreadable` / `commands path is not a directory` | Loader WARN: ENOENT dir vs existing-but-file path (never fatal) |
| `failed to register SDD commands` | logger.error only if the whole registration throws — the loader prevents it, so it is not the ENOENT marker |
| `command name collision, overwriting` | User command replaced |
| `loading SDD agents` / `SDD agents registered` | Agent phase |
| `agent name collision, merging onto existing config` | User agent merged |
| `registering sdd-command global deny` / `registered sdd-command global deny` | Custom tool denied globally |
| `granting external_directory access to bundled templates` / `granted external_directory access to bundled templates` | Template read grant |
| `cannot grant templates access: ...` | Grant skipped (global string / deny) |

#### Inspecting what requests hit the model

The gateway logs every request (enabled by `bifrost-provision.sh`):
prompt + response content, model, tokens, cost, latency, and status.
That is the evidence source for "which model got what" — for TC-REG-03
(per-agent model honored), for group J (tokens/cost), and for any
"the model did X" assertion.

From inside the workspace (compose DNS):

```text
qa exec 'curl -fsS "http://bifrost:8080/api/logs?providers=openrouter&limit=20"'
```

| Query param | Purpose (example) |
| --- | --- |
| `models=` | filter by model, e.g. `models=qwen3.5-plus-20260420` |
| `content_search=` | search prompts/responses, e.g. `content_search=Implementation Plan` |
| `status=` | `success,error` |
| `start_time=` / `end_time=` | RFC3339 window for one test run |
| `limit=` / `offset=` | pagination |

The response carries `logs[]` plus `stats` (total requests, tokens,
cost, average latency) — copy the excerpt into the evidence file.

With the ports override (`QA_HOST_PORT=8080`) the Web UI is available at
`http://localhost:8080/logs` (sandbox VM: `http://192.168.64.1:8080/logs`)
with real-time request tracing, model filters and cost analytics.

Request logs never contain the OpenRouter API key (it is an env
reference; only request/response content is recorded).

**Request-body (raw) capture is limited:** the log rows carry
`token_usage`, cost and latency always, but `raw_request` / `raw_response`
are only populated when bifrost has an object-storage backend connected
(`retain_content_in_object_storage`, verified on v1.6.11 — the flag alone
leaves the fields empty). This compose stack is not connected to one, so
TC-PERF-03's `reasoningEffort` passthrough is recorded as informational
instead of verified; the per-request `options` are not observable in
`/api/logs` without object storage.

### 3.6 Driving opencode in the QA image

The recommended driver is the web UI. `opencode serve` serves opencode's
web client, and every interactive gate the suite needs — slash commands,
the agent selector, permission asks, the `question`-tool interview and
approval gates — renders as DOM a browser can locate, assert and answer,
with screenshots for evidence instead of ANSI screen text.

```text
QA_HOST_PORT=8080 qa/scripts/setup/qa-up.sh   # publishes gateway + web UI
docker compose -f qa/docker-compose.yml \
  -f qa/docker-compose.ports.yml up -d qa
docker exec -d opencode-sdd-qa-qa-1 /app/qa/docker/serve-web.sh
docker exec opencode-sdd-qa-qa-1 sh -c 'cat /tmp/serve-web.ready'
# from the host: http://localhost:4097
# (sandbox VM: http://192.168.64.1:4097; QA_WEB_PORT picks another port)
```

`serve-web.sh` sets `OPENCODE_ENABLE_QUESTION_TOOL=1` — headless
`opencode serve` gates the `question` tool to app/cli/desktop clients
(upstream #20514, #27644, #19702), so without the flag the SDD
interview/approval gates never fire. Web-UI specifics: the slash menu
renders command descriptions in full, including the
`(provided by opencode-sdd)` suffix (see TC-REG-01); pending questions
render as an in-session answer UI; permission asks are `Deny` /
`Allow always` / `Allow once` buttons.

The only TTY-only part of the suite is the CLI wizard (group C) — an
inquirer program with no non-interactive mode for its interactive cases
(`install --yes` covers the rest). Drive it with `qa/docker/pty-driver.py`
(python3 stdlib: staged `send:`/`raw:`/`key:`/`sleep:`/`wait:` items,
auto-answer for prompt lines, `--log`/`--snapshot` files):

```text
qa exec 'python3 /app/qa/docker/pty-driver.py --cols 200 \
  --log /tmp/wizard.log --snapshot /tmp/wizard.screen \
  --send "send:..." --timeout 300 -- node /app/build/cli/install.js install'
```

For deterministic assertion-level work (no model whims) the opencode
server API is available without the browser — `opencode run -s
<session-id>` continues a session headlessly, and `/session/{id}/message`
is the same route the web UI uses; see TC-TOOL-01's deterministic
alternative.

**Per-case reset**: run `reset-scratch.sh` (see 3.3) before each
independent case, or `pnpm qa:run --case-reset` to have the runner do
it. Time budget per LLM-heavy case is in section 10.

## 4. Test Plan Structure

The cases are split across individual feature files, one per group of
the suite. The file name (minus `.feature`) names the area; the group
letter/prefix in each TC id matches the file's group:

| Feature file | Group | Cases |
| --- | --- | --- |
| `llm.feature` | A — Gateway + model infrastructure | TC-LLM-01..03 |
| `registration.feature` | B — Plugin registration and config merging | TC-REG-01..05 |
| `cli.feature` | C — CLI install wizard | TC-CLI-01..08 |
| `tool.feature` | D — `sdd-command` custom tool | TC-TOOL-01..03 |
| `short-flow.feature` | E — SDD short flow | TC-SF-01..05 |
| `prd-flow.feature` | F — PRD long flow | TC-PF-01..06 |
| `orchestrator.feature` | G — `prd-auto-implement` orchestrator | TC-ORCH-01..04 |
| `docs.feature` | H — Doc maintenance commands | TC-DOC-01..04 |
| `robustness.feature` | I — Robustness and degradation | TC-ROB-01..05 |
| `perf.feature` | J — Cost and performance | TC-PERF-01..03 |

The group letter in each TC id (`TC-<GROUP>-NN`) matches the table
above, so the coverage matrix, exit criteria, and record sheet reference
files and groups interchangeably. Run one group per opencode session
using the execution drill in section 2.1; groups are independent unless
a case's `Given` states otherwise.

## 5. Coverage Matrix

| Feature | Automated e2e | Manual case |
| --- | --- | --- |
| Template rewrite / asset inlining | yes (deterministic) | TC-REG-02, TC-TOOL-01 |
| `sdd-command` allowlist mechanics | yes | TC-TOOL-01..03 (sanity) |
| Permission merging + model preservation | yes | TC-REG-03..05 |
| Orchestrator loops / escalation / resume | yes | TC-ORCH-01..03 (web UI) |
| CLI wizard end to end | no | TC-CLI-01..08 |
| Short flow / PRD flow / doc flow with a real LLM | no | Groups E, F, H |
| Failure paths (server down, missing assets) | partial | TC-ROB-01..05 |
| Token cost and context fit | no | Group J |
| Artifact templates' actual content | partial | Group E/F assertions |
| Plan quality on a strong model | no | Groups E/F/G — review with the model recorded |

## 6. Running the suite

The plans are instructions a human tester carries out; the runner is
the checklist and the record sheet.

```bash
pnpm qa:run                    # interactive: walk every scenario
pnpm qa:run --list             # print all scenario IDs and titles
pnpm qa:run --feature cli      # only that file (name substring match)
pnpm qa:run --id @TC-CLI-1     # only that scenario
pnpm qa:run --auto-pass        # non-interactive: mark everything as passed
pnpm qa:run --case-reset       # reset the scratch baseline before every case
pnpm qa:run --evidence         # copy each case's .sdd + opencode.log into the report
pnpm qa:run --run-id <id>      # fixed run id instead of a timestamp
```

`--case-reset` runs `qa/docker/reset-scratch.sh` in the workspace before
every case (use it for INDEPENDENT groups — registry, CLI, docs; never
for the chained groups F/G and E/SF-2..4, which build on the previous
case's artifacts; those reset once at their first case, see 6.1).
`--evidence` copies each case's `.sdd` tree and raw `opencode.log` into
`qa/output/<run-id>/evidence/<case-id>/` right after the verdict — a
case's evidence survives the reset that the next case triggers. Both
flags degrade to a warning (never a verdict) when the stack is down.

The runner prints each scenario and its steps, then accepts `p`/`f`/`s`/`q`
(pass / fail / skip / quit; anything else counts as pass). After the
verdict it asks for a **description** of what was done or observed; the
description is stored in the report together with the verdict.
`--auto-pass` skips both prompts and records empty descriptions.

Each run gets a unique run id: a local timestamp
(`2026-08-28T12-34-56`, with a numeric suffix when the directory already
exists) or `--run-id <id>`. Reports are written progressively to
`qa/output/<run-id>/report.json` and `report.md`, so an interrupted run
keeps its results. The markdown report contains the run id, a summary
table, and per-scenario details with status and notes.

Linting the plans (`pnpm lint:gherkin`, chained into `pnpm lint`):
`qa/scripts/bdd/check-gherkin-ids.ts` plus `gherkin-lint` with
`qa/.gherkin-lintrc`.

### 6.1 Execution drill per group

1. Ensure `pnpm check` and `pnpm test:e2e` are green before starting.
2. Ensure `qa/scripts/setup/check-deps.sh` passes and `qa/scripts/setup/qa-up.sh`
   reports the stack healthy AND its post-provision verification passes
   (Group A checks are folded into bring-up; a stale workspace image is
   refused).
3. Reset the baseline: `qa exec '/app/qa/docker/reset-scratch.sh
   /work/sdd-manual'` before each group's first case (independent cases
   reset their own baseline in their `Given`; the runner's `--case-reset`
   does it for every case). Do NOT reset between chained cases (F/G,
   E/SF-2..4 keep the previous case's artifacts).
4. Open the session: the web UI — `serve-web.sh` + a browser (section
   3.6). The wizard cases (group C) run the CLI directly; the opencode
   server API (`opencode run -s <session-id>`) is there for
   deterministic continuations.
5. Enumerate the group's cases with `pnpm qa:run --feature <file> --list`.
6. Run the cases (verbatim from the runner), then verify every asserted
   step before recording a verdict in the runner.
7. Copy artifacts out with `docker compose cp` for the evidence folder
   (section 7) and record the outcome in the runner's report (or use
   `pnpm qa:run --evidence` for automatic `.sdd`/log collection).
8. Before re-running an LLM-heavy group, check `/api/logs` for what the
   failed run already spent, and note the expected time per case
   (section 10). If a quality case fails because the model deviated
   (skipped the interview, split the slices differently), record the
   deviation and re-run ONCE on a stronger model
   (`BIFROST_MODEL=... wire-opencode-config.sh`) before filing a defect.

## 7. Evidence and Record Sheet

The runner writes the verdict record to `qa/output/<run-id>/report.md`
(and `.json`). On top of that, copy the artifacts under test out of the
workspace so they survive a stack reset:

```text
docker compose -f qa/docker-compose.yml cp qa:/work/sdd-manual/.sdd \
  qa/evidence/<YYYY-MM-DD>-<group>/sdd-artifacts
```

`qa/evidence/<YYYY-MM-DD>-<group>/` contains:

- the raw opencode log (`/home/qa/.local/share/opencode/log/opencode.log`),
  unmodified;
- the artifacts under test (spec.md / prd.md / plan.md / review.md /
  validation.md per case);
- screenshots of the session (web UI) or terminal captures of the TUI;
- the `/api/logs` excerpt when the case asserts model/token/cost values;
- a note recording the **model under test** (e.g.
  `bifrost/openrouter/deepseek/deepseek-v4-flash`), the opencode version,
  the plugin commit SHA (the source baked into the image), and the
  gateway image digest — a result on `deepseek-v4-flash` is not
  comparable to one on `claude-sonnet-5`.

`qa/evidence/` and `qa/output/` are gitignored; run records stay local.

## 8. Exit Criteria

- `pnpm check` and `pnpm test:e2e` are green before starting.
- Group A: TC-LLM-01/02 pass; if tool calls fail, stop and fix the
  provider/key (nothing downstream works).
- All @P0 cases pass: TC-REG-01/02, TC-CLI-02/03, TC-SF-01..03,
  TC-PF-01/02/06, TC-ORCH-01.
- All @P1 cases pass or have a filed defect with evidence; @P2 are
  informational for the release decision.
- Every failure is recorded in the runner's report with the TC id,
  actual behavior, and log excerpt — never fixed silently.

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `check-deps.sh` fails on OpenRouter reachability | the docker host needs outbound HTTPS to `https://openrouter.ai/api/v1` (the API host is `openrouter.ai`, not `api.openrouter.ai`); fix the network/firewall, not the stack |
| `qa-up.sh` errors `no OpenRouter API key available` | script intended: copy `qa/.env.example` to `qa/.env` and fill it in; or `export OPENROUTER_API_KEY`, `OPENROUTER_KEY_FILE`, or run interactively (3.2) |
| Smoke: `model list does not contain <slug>` | the key was invalid/expired or the provider is inactive: check `GET /api/providers` (`provider_status`), then fix `qa/.env` and recreate (`docker compose down && qa-up.sh`) |
| Smoke: `no content` / `tool-call check failed` | the model answered in text or the key's OpenRouter credit is out; check the raw payload the script prints and `/api/logs?status=error` |
| Tool calls missing | the model must be in the allowlist (`qa/bifrost/models.tsv`) AND flagged `"tool_call": true` in opencode config; verify the id exists on OpenRouter (some models drop tool support over time) |
| Wizard says no models | the `bifrost` provider must be configured (3.4) and not listed in `disabled_providers`; the probe reads the config only — it never pings the provider, so a stopped gateway is NOT the cause |
| Wizard lists unexpected models | opencode's built-in `opencode` provider is enabled; add `disabled_providers: ["opencode"]` (3.4) |
| After changing `qa/bifrost/models.tsv` nothing changed | re-run `qa-up.sh` — provisioning now reconciles the key's model allowlist with the file; a full gateway reset is only needed for provider-level drift (`docker volume rm opencode-sdd-qa_bifrost-data` then `qa-up.sh`) |
| Gateway restarted after `down`, provider gone | `down` removes the container and its env: re-run `qa-up.sh` — it reads `qa/.env` again (or prompts); restart-only flows use `llm-down.sh`/`llm-up.sh` |
| Published port already in use | the default stack publishes no host port; for the opt-in override pick another: `QA_HOST_PORT=8081 qa/scripts/setup/qa-up.sh` |
| opencode in sandbox VM can't reach the gateway | host-side scripts only: publish a port with the `qa/docker-compose.ports.yml` override, then use `http://192.168.64.1:<port>`; inside the workspace nothing changes (compose DNS) |
| Plugin changes not visible | `docker compose -f qa/docker-compose.yml build qa && docker compose -f qa/docker-compose.yml up -d qa` — the image compiles `build/` itself; no hot reload |
| `qa-up.sh` refuses: workspace image is STALE | the image bakes the repo and its SRC_HASH label differs from the current checkout; rebuild through `qa-up.sh` (it passes the hash), or `QA_ALLOW_STALE_IMAGE=1 qa-up.sh` to start anyway (not recommended) |
| `qa-up.sh` fails at post-provision verification | read the FAIL lines (`verify-provision.sh`): provider missing/inactive, zero keys, empty `/v1/models`, no content from the smoke completion — fix `qa/.env` (key) or clear the gateway volume (`docker volume rm opencode-sdd-qa_bifrost-data`) and re-run `qa-up.sh` |
| `docker exec` returns nothing after a pause | sandbox VM idle-stdout drop: use `docker exec -d` plus a file (`serve-web.sh`'s `/tmp/serve-web.ready`, `pty-driver.py`'s `--snapshot`/`--log`) and `cat` it; never rely on exec stdout for a command that sleeps (3.6) |
| `opencode run` appears to hang in exec | the session's interactive clients are the web UI and the TUI; the non-interactive continuation is `opencode run -s <session-id>` — use it (3.6), it does not hang |
| Web UI server not ready / browser cannot connect | start `qa/docker/serve-web.sh` (it writes `/tmp/serve-web.ready` inside the container), publish the web port with the ports override (`QA_WEB_PORT`, default 4097; container 4096), and open `http://localhost:4097` (sandbox VM: `http://192.168.64.1:4097`). The server serves the web client at `/` — no separate frontend to start |
| SDD interview / approval gates never fire in the web UI | headless `opencode serve` gates the `question` tool off (`OPENCODE_ENABLE_QUESTION_TOOL`); `serve-web.sh` sets it to `1` (3.6) |
| Stack dirty after experiments | `docker compose -f qa/docker-compose.yml down -v` (removes gateway data, scratch work, opencode state) |
| Runner fails with `no test cases matched the filters` | the file/ID filters are substring/exact matches; check `pnpm lint:gherkin` passes and use `--list` to find ids |
| E2E suite fails | it needs `opencode` on PATH and a built `build/`; unrelated to `qa/` |

## 10. Token and Cost Guidance

Inference goes through OpenRouter and is **billed to the key's account**:

- **Stay on the cheap default.** `deepseek/deepseek-v4-flash` is
  ~$0.09/$0.18 per 1M tokens (prompt/completion) and strong enough for
  every flow; `xiaomi/mimo-v2.5` (~$0.14/$0.28 per 1M) is the cheapest
  and is the wizard's cheap-tier match. Reach for `claude-sonnet-5`
  (~$2/$10 per 1M) only when a group explicitly tests frontier
  behavior, and record it.
- **Set a budget in OpenRouter** (Settings → Credits/Budget) before the
  run and check the usage page when done; the gateway's `/api/logs`
  stats give the per-run cost breakdown (group J).
- Keep `disabled_providers: ["opencode"]` in the scratch config (3.4) so
  nothing silently routes to different models.
- Keep fixtures one-function sized (section 3.3); every file the agent
  reads is paid for in prompt tokens.
- Merely STARTING the stack costs nothing (no inference until a flow
  runs); only groups A (smoke), B..J consume tokens. Group C (wizard)
  and the TC-REG-01 surface check need no inference at all.
- Keep the e2e suite as the regression workhorse — it is free and far
  faster than a manual re-run; use manual runs for what it cannot cover.
- Batch by group: one opencode session per group, capture
  `--print-logs` once, and reuse it across cases instead of re-running
  for each assertion.
- A failed run still costs what was sent: check `/api/logs` before
  re-running a group so a broken config does not burn the same tokens
  twice.
- **Expected time per LLM-heavy case** (typical on deepseek-v4-flash):
  `/prd-auto-implement` chain 22–35 min
  (interrupt/resume adds a resume run), planner/review/implement/validate
  commands 2–8 min each, doc commands 2–5 min, PERF-03's two planner runs
  ~8 min together. A five-minute re-check of `/api/logs` before a re-run
  is cheaper than a second failed run.
- **Nondeterminism is budgeted**: the flows' interview/approval gates may
  fire or not depending on the model's own judgment (SF-01, REG-03,
  PF-03). The cases assert the template/mechanism and record the observed
  outcome — record the model's choice and move on; retry once on a
  stronger model before treating a quality case as a defect.
