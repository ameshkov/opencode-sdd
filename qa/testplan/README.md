# Manual Test Plan — opencode-sdd (QA suite)

This is the manual QA plan for
[opencode-sdd](https://github.com/opencode-ai/opencode-sdd). Everything
needed to run it lives in `qa/`:

| Path | Purpose |
| --- | --- |
| `qa/docker-compose.yml` | Local LLM: llama.cpp server plus Ling-3.0-tiny |
| `qa/scripts/check-deps.sh` | Verify the host prerequisite: docker engine + compose file |
| `qa/scripts/llm-up.sh` | Start the LLM and wait until healthy |
| `qa/scripts/llm-down.sh` | Stop the LLM (model cache is kept) |
| `qa/scripts/llm-smoke.sh` | Smoke test: model list, chat, tool call |
| `qa/scripts/scratch-init.sh` | Create the scratch test project |
| `qa/scripts/wire-opencode-config.sh` | Write `opencode.json` pointing at the local LLM |
| `qa/testplan/README.md` | This document: structure, case format, environment, criteria |
| `qa/testplan/plans/` | The test cases, one file per group (section 4) |

The LLM is
[Ling-3.0-tiny](https://huggingface.co/inclusionAI/Ling-3.0-tiny)
(7.9B total / 1.3B active MoE, MIT license, tool calling), served
locally by llama.cpp. All tests consume local CPU only — no remote
LLM tokens.

## 1. Purpose and Scope

### 1.1 What the plan verifies

This plan verifies the **user-visible behavior** of the plugin against a
real opencode TUI and a real LLM:

- The install wizard CLI end to end (interactive, `--yes`, failure paths).
- Plugin registration: commands, agents, permission grants, config merging.
- The short SDD flow, the PRD long flow, and the `prd-auto-implement`
  orchestrator: artifact lifecycle, status transitions, finalization.
- The `sdd-command` tool and the doc-maintenance commands.
- Failure paths: missing artifacts, missing prerequisites, LLM down,
  malformed config, missing asset directories.
- Cost sanity: tokens per step, context fit, thinking-mode trade-off.

### 1.2 What the plan does NOT cover

- Deterministic mechanics already proven by `pnpm test:e2e` (mock LLM):
  template-token rewriting, `sdd-command` allowlist error strings,
  permission-map merging, loop caps and escalation order, config-hook
  idempotency. Manual runs re-checks a few of them cheaply, marked
  "sanity" below.
- Model quality, reasoning benchmarks, or TUI keyboard aesthetics.

### 1.3 Priorities

| Priority | Meaning |
| --- | --- |
| P0 | Blocking: must pass before the plugin can be considered working |
| P1 | Core: must pass before a release |
| P2 | Nice-to-have: quality, cost, and edge-case checks |

## 2. Test Case Format

Every test case across all plan files uses the same anatomy so results
are comparable:

- **Objective** — what behavior is verified and why it matters.
- **Verification** — how the tester proves pass/fail (file assertions,
  log greps, API calls, TUI observation).
- **Preconditions** — state required before the case starts.
- **Steps** — concrete actions, including exact commands and inputs.
- **Expected result** — explicit *Assert* bullets; each one must hold for
  the case to pass.
- **Evidence** — what to keep in `qa/evidence/<YYYY-MM-DD>/` (file paths,
  log excerpts, screenshots).

### 2.1 Where tests run: the workspace container

ALL manual testing happens inside the `qa` workspace container - the
opencode TUI, the scratch project, the CLI wizard, and the configs they
patch never touch the host. The host runs only docker (and holds this
repo).

- `qa/scripts/qa-up.sh` builds and starts both services and waits for LLM
  health; nothing else is required on the host.
- The plugin source **and** its compiled `build/` are baked into the
  image at `/app` (the Dockerfile runs `pnpm install && pnpm build`
  itself, so changes to the plugin take effect after a rebuild, see
  section 3.2).
- The scratch project lives in the `qa-work` volume at `/work`; opencode's
  own state (config, logs, history, cache) lives in `qa-home` at
  `/home/qa`. `down -v` resets both.
- Inside the container the LLM is always
  `http://llama-server:8080/v1` (compose DNS) — no port mapping, no
  `localhost` confusion.

Shorthand used everywhere below (run from the repo root on the host):

```text
qa exec '<cmd>'    =  docker compose -f qa/docker-compose.yml exec -it qa \
                        bash -lc 'cd /work/sdd-manual && <cmd>'
```

`qa exec` allocates a TTY (`-it`), which the opencode TUI and the wizard
prompts need. The opencode session starts with:

```text
qa exec 'opencode --log-level DEBUG --print-logs'
```

Copy evidence out of the container with:

```text
docker compose -f qa/docker-compose.yml cp qa:/work/sdd-manual/.sdd \
  qa/evidence/<date>/sdd-artifacts
```

Execution drill per group:

1. Ensure `qa/scripts/check-deps.sh` passes and `qa/scripts/qa-up.sh`
   reports the stack healthy (LLM healthy, workspace ready).
2. Open the TUI: `qa exec 'opencode --log-level DEBUG --print-logs'`.
3. Run the case, then verify every Assert bullet before moving on.
4. Copy artifacts out with `docker compose cp` and record the outcome in
   the record sheet (section 7).

## 3. Environment

### 3.1 Prerequisites

The only host requirement is a working Docker engine. Everything else is
baked into the workspace image:

| Requirement | Where | Notes |
| --- | --- | --- |
| Docker engine | host | `docker info`; ~6 GB free for the 4.8 GB model + ~1 GB image |
| opencode binary 1.17.8 | image | `qa/Dockerfile` `ARG OPENCODE_VERSION` |
| Node 24, pnpm 10.14 | image | CLI wizard, scratch project |
| git, python3, vim, curl | image | scratch project, config edits, smoke tests |
| Plugin source + `build/` | image | compiled by `qa/Dockerfile` from the repo context |

Run `qa/scripts/check-deps.sh` once per machine; it exits non-zero and
names the missing item. Rebuilding the workspace bundle after plugin
changes: `docker compose -f qa/docker-compose.yml build qa`, then
restart — see section 3.2.

### 3.2 Stack: local LLM + workspace

```text
qa/scripts/qa-up.sh        # build + start LLM and workspace, wait for health
qa/scripts/qa-shell.sh     # interactive shell inside the workspace
qa/scripts/llm-up.sh       # LLM only: start + wait
qa/scripts/llm-down.sh     # LLM only: stop (model cache kept)
qa/scripts/llm-smoke.sh    # LLM only: model list, chat, tool call
```

- The stack is two containers (compose file `qa/docker-compose.yml`):
  `llama-server` (the LLM) and `qa` (the workspace).
- Port: `LLM_PORT` env var, default `8080` (published for host-side
  smoke tests only).
- Base URL on the host: `LLM_BASE_URL=http://localhost:8080` (or the
  gateway URL in the sandbox VM, see below). Inside the workspace the
  container environment already sets
  `LLM_BASE_URL=http://llama-server:8080/v1`.
- macOS sandbox VM: published ports bind on the host, so HOST-side
  scripts and health checks must use `http://192.168.64.1:<port>`
  instead of localhost. `qa-up.sh` and `llm-up.sh` probe both and
  print the gateway URL for that case. Inside the workspace container
  nothing changes (compose DNS).
- Image requirement: llama.cpp b10470+ (BailingMoE3 support, merged
  2026-08-17). The `:server` tag tracks latest releases; if the server
  logs `unknown model architecture: 'bailingmoe3'`, pull a newer tag.
- Plugin changes: `docker compose -f qa/docker-compose.yml build qa &&
  docker compose -f qa/docker-compose.yml up -d qa` — the image
  recompiles `build/` from the repo context.
- Full reset: `docker compose -f qa/docker-compose.yml down -v` removes
  the model cache, scratch work, and opencode state.

### 3.3 Scratch project

```text
qa exec '/app/qa/scripts/scratch-init.sh /work/sdd-manual'
```

The script creates a small git repo (`src/math.ts` with `add`, vitest as
dev dependency, initial commit) with a local git identity for QA. Keep it
tiny on purpose: shorter reads and prompts mean fewer tokens and faster
iterations with the tiny model. The project lives in the `qa-work`
volume, so it survives container restarts and is gone only after
`down -v`.

Fixtures (feature descriptions used by the cases):

| ID | Feature | Used in |
| --- | --- | --- |
| F1 | "Add `mul(a, b)` to `src/math.ts` following TDD." | Short flow |
| F2 | "Add `divide(a, b)` to `src/math.ts` that throws on division by zero. Single issue, no HITL." | PRD flow |
| F3 | F2 but the PRD must ask the human whether to throw or return `null` on division by zero. | HITL gate |
| F4 | "Update the docs of this scaffolding project." | Doc commands |

### 3.4 opencode configuration

```text
qa exec '/app/qa/scripts/wire-opencode-config.sh /work/sdd-manual file:///app'
```

This writes `/work/sdd-manual/opencode.json` (the script picks up the
container's `LLM_BASE_URL` environment variable):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "local-llm": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://llama-server:8080/v1" },
      "models": {
        "ling-3.0-tiny": { "name": "Ling 3.0 Tiny", "tool_call": true },
        "deepseek-ling-3.0-tiny": { "name": "DeepSeek alias of Ling 3.0 Tiny", "tool_call": true },
        "qwen-ling-3.0-tiny": { "name": "Qwen alias of Ling 3.0 Tiny", "tool_call": true },
        "mimo-ling-3.0-tiny": { "name": "MiMo alias of Ling 3.0 Tiny", "tool_call": true }
      }
    }
  },
  "model": "local-llm/ling-3.0-tiny",
  "disabled_providers": ["opencode"],
  "plugin": ["file:///app"]
}
```

`file:///app` is the baked plugin inside the image. Restart opencode
after every config change (plugins load once at startup); no hot reload
exists.

`disabled_providers: ["opencode"]` turns off opencode's built-in
free-tier provider, which is loaded automatically whenever no explicit
provider list is set. Leaving it on breaks two QA properties: requests
can reach a REMOTE gateway (this stack promises no remote LLM tokens),
and its 7 models are enumerated ahead of the local one in every model
list — which pushes `local-llm/ling-3.0-tiny` below the CLI wizard's
7-item prompt fold and makes the wizard's `[recommended]` badges land on
gateway models. Verify the local provider is the only one with:

```text
qa exec 'cd /work/sdd-manual && node -e "
  const { probe } = require(\"/app/build/cli/model-probe.js\");
  probe().then((r) => console.log(r.models.map((m) => m.providerID + \"/\" + m.id)));
"'
```

To force the "no models" degradation path on purpose (TC-CLI-07), add
the local provider to the same list: `"disabled_providers": ["opencode",
"local-llm"]`.

#### Model aliases for recommendation coverage

Besides the real id, the wiring registers three aliases of the SAME served
model. They exist because a single-model provider silently makes several
behaviours unobservable:

| Alias id | Tier it matches | Keyword (priority) |
| --- | --- | --- |
| `deepseek-ling-3.0-tiny` | strong | `deepseek` (0) |
| `qwen-ling-3.0-tiny` | strong | `qwen` (1) |
| `mimo-ling-3.0-tiny` | cheap | `mimo` (0) |

- TC-CLI-02: `ling-3.0-tiny` matches none of the wizard's keywords
  (`deepseek`, `qwen`, `mimo`, `gemini`), so without aliases no
  `[recommended]` badge is ever shown, the keyword-priority ordering
  cannot be checked, and `--yes` only ever exercises the tier-fallback
  branch — never the recommended branch.
- TC-REG-03: proving the plugin preserved a user's per-agent `model`
  requires an id DIFFERENT from the global default; with one model the
  assertion passes no matter what the merge does.

All ids resolve to the one loaded GGUF: llama.cpp ignores the request's
`model` field and answers with whatever model is loaded (`llm-smoke.sh`
asserts this; plain completions, tool calls, and a full `opencode run
--model local-llm/deepseek-ling-3.0-tiny` all succeed, and the response's
`model` is always `bloomer010/Ling-3.0-tiny-GGUF:Q4_K_M`). So an agent
assigned an alias still runs on the local model at the same speed, and
the display names ("DeepSeek alias of Ling 3.0 Tiny") keep the TUI model
indicator self-explanatory.

Wire with `MODEL_ALIASES=0` only if the LLM server VALIDATES the
requested model id (llama.cpp router mode, vLLM, ...), where alias ids
would 404 — `llm-smoke.sh` fails on exactly that condition:

```text
qa exec 'MODEL_ALIASES=0 /app/qa/scripts/wire-opencode-config.sh \
  /work/sdd-manual file:///app'
```

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
| `SDD commands registered` | All commands done (info, with count) |
| `failed to register SDD commands` | Command phase error (never fatal) |
| `command name collision, overwriting` | User command replaced |
| `loading SDD agents` / `SDD agents registered` | Agent phase |
| `agent name collision, merging onto existing config` | User agent merged |
| `registering sdd-command global deny` / `registered sdd-command global deny` | Custom tool denied globally |
| `granting external_directory access to bundled templates` / `granted external_directory access to bundled templates` | Template read grant |
| `cannot grant templates access: ...` | Grant skipped (global string / deny) |

LLM-side logs: `docker compose -f qa/docker-compose.yml logs -f
llama-server` shows prompt-eval and decoded token counts (used by
group J).

Evidence convention: one folder per run,
`qa/evidence/<YYYY-MM-DD>-<case-group>/`, containing the opencode log, a
`results.md` record sheet, and copies of the artifacts under test
(copied out with `docker compose cp`).

## 4. Test Plan Structure

The test cases are split across individual plan files under `plans/`,
one file per group of the suite. Each file holds its group's heading,
intro paragraph, and all of the group's cases in order, using the exact
case anatomy from section 2.

| Plan file | Group | Cases |
| --- | --- | --- |
| `plans/llm.md` | A — Local LLM infrastructure | TC-LLM-01..03 |
| `plans/registration.md` | B — Plugin registration and config merging | TC-REG-01..05 |
| `plans/cli.md` | C — CLI install wizard | TC-CLI-01..08 |
| `plans/tool.md` | D — `sdd-command` custom tool | TC-TOOL-01..03 |
| `plans/short-flow.md` | E — SDD short flow | TC-SF-01..05 |
| `plans/prd-flow.md` | F — PRD long flow | TC-PF-01..06 |
| `plans/orchestrator.md` | G — `prd-auto-implement` orchestrator | TC-ORCH-01..04 |
| `plans/docs.md` | H — Doc maintenance commands | TC-DOC-01..04 |
| `plans/robustness.md` | I — Robustness and degradation | TC-ROB-01..05 |
| `plans/perf.md` | J — Cost and performance | TC-PERF-01..03 |

The group letter in each TC id (`TC-<GROUP>-NN`) matches the heading
above, so the coverage matrix, exit criteria, and record sheet reference
groups and plans interchangeably. Run one group per opencode session
using the execution drill in section 2.1; groups are independent unless
a case's Preconditions state otherwise.

## 5. Coverage Matrix

| Feature | Automated e2e | Manual case |
| --- | --- | --- |
| Template rewrite / asset inlining | yes (deterministic) | TC-REG-02, TC-TOOL-01 |
| `sdd-command` allowlist mechanics | yes | TC-TOOL-01..03 (sanity) |
| Permission merging + model preservation | yes | TC-REG-03..05 |
| Orchestrator loops / escalation / resume | yes | TC-ORCH-01..03 (TUI) |
| CLI wizard end to end | no | TC-CLI-01..08 |
| Short flow / PRD flow / doc flow with a real LLM | no | Groups E, F, H |
| Failure paths (server down, missing assets) | partial | TC-ROB-01..05 |
| Token cost and context fit | no | Group J |
| Artifact templates' actual content | partial | Group E/F assertions |

## 6. Exit Criteria

- `pnpm check` and `pnpm test:e2e` are green before starting.
- Group A: TC-LLM-01/02 pass; if tool calls fail, stop and fix the
  server (nothing downstream works).
- All P0 cases pass: TC-REG-01/02, TC-CLI-02/03, TC-SF-01..03,
  TC-PF-01/02/06, TC-ORCH-01.
- All P1 cases pass or have a filed defect with evidence; P2 are
  informational for the release decision.
- Every failure is recorded in `qa/evidence/<date>/results.md` with the
  TC id, actual behavior, and log excerpt — never fixed silently.

## 7. Evidence and Record Sheet

`qa/evidence/<YYYY-MM-DD>-<group>/results.md` example:

```markdown
# <date> — <group> results

| TC | Priority | Result | Notes | Evidence file |
| --- | --- | --- | --- | --- |
| TC-LLM-01 | P0 | PASS | first start took 9 min (download) | smoke.log |
| TC-LLM-02 | P0 | PASS | tool_calls parsed | smoke.log |
| TC-REG-01 | P0 | FAIL | only 15 commands listed - see log L123 | opencode.log |
```

Filing conventions:

- Logs: raw `opencode --print-logs` output, unmodified. The on-disk log
  at `/home/qa/.local/share/opencode/log/opencode.log` is copied out with
  `docker compose -f qa/docker-compose.yml cp qa:<path>
  qa/evidence/<date>/`.
- Artifacts: copy `spec.md`/`prd.md`/`validation.md`/`review.md` per
  case with `docker compose -f qa/docker-compose.yml cp
  qa:/work/sdd-manual/... qa/evidence/<date>/`.
- Reproducibility: record the opencode version, plugin commit SHA (the
  source baked into the image), and the LLM image digest used.

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `unknown model architecture: 'bailingmoe3'` | Image older than b10470; pull a newer `ghcr.io/ggml-org/llama.cpp:server` tag and recreate |
| Model downloads on every start | `LLAMA_CACHE` must point into the mounted volume; check `docker compose -f qa/docker-compose.yml config` |
| Tool calls missing | `--jinja` present? model flagged `"tool_call": true` in opencode config? retry (tiny models occasionally answer in text) |
| Prompts truncated | raise `-c` in `qa/docker-compose.yml`, `docker compose up -d` |
| opencode in sandbox VM can't reach LLM | host-side scripts only: use `http://192.168.64.1:<port>` as `LLM_BASE_URL`; inside the workspace nothing changes (compose DNS) |
| Plugin changes not visible | `docker compose -f qa/docker-compose.yml build qa && docker compose -f qa/docker-compose.yml up -d qa` — the image compiles `build/` itself; no hot reload |
| Wizard says no models | the local provider must be configured (3.4) and not listed in `disabled_providers`; the probe reads the config only — it never pings the provider, so a stopped LLM is NOT the cause |
| Wizard lists unexpected models | opencode's built-in `opencode` provider is enabled; add `disabled_providers: ["opencode"]` (3.4) |
| `opencode run` (non-interactive) hangs in exec | use `qa exec 'opencode'` (TTY) for the TUI; plain `exec` without `-it` is for file/diff checks only |
| Stack dirty after experiments | `docker compose -f qa/docker-compose.yml down -v` (removes model cache, scratch work, opencode state) |
| E2E suite fails after this work | it needs `opencode` on PATH and a built `build/`; unrelated to `qa/` |

## 9. Token-Saving Guidance

- The local server is the only provider configured for QA. Never point
  a test session at a remote model. Keep
  `disabled_providers: ["opencode"]` in the scratch config (3.4) so
  opencode's auto-loaded built-in gateway provider can never be selected
  by accident — the wizard, the Tab switcher and the model picker would
  otherwise all offer remote models that cost real tokens.
- Keep fixtures one-function sized (section 3.3); every file the agent
  reads is paid for in prompt tokens.
- Keep the context at 16K (`-c 16384`) unless TC-PERF-02 forces more;
  CPU inference and memory degrade with context size.
- Keep `--reasoning-effort low` for mechanics tests; enable thinking
  only in TC-PERF-03 and record the cost.
- Use the deterministic e2e suite for regression — it costs nothing and
  is far faster than a manual re-run.
- Batch by group: one opencode session per group, capture
  `--print-logs` once, and reuse it across cases instead of re-running
  for each assertion.
- Group C (wizard) needs no LLM at all — run it with the server down if
  you want to save RAM.
