# Group C — CLI install wizard

The wizard runs from the baked build inside the workspace:
`qa exec 'node /app/build/cli/install.js ...'` (`opencode-sdd` is the
installed bin name). These tests are the only place the wizard is
exercised end to end. They cost no LLM tokens: the probe only reads the
project config, so the local server only needs to be up for the cases
that check model discovery.

## TC-CLI-01 — Usage and argument handling (P1)

- **Objective**: Verify the CLI contracts: help, unknown flags, unknown
  subcommands, exit codes.
- **Verification**: stdout/stderr and exit codes.
- **Preconditions**: stack up (`qa/scripts/qa-up.sh`).
- **Steps**:
  1. `qa exec 'node /app/build/cli/install.js install --help; echo
     exit=$?'`
  2. `qa exec 'node /app/build/cli/install.js install --bogus; echo
     exit=$?'`
  3. `qa exec 'node /app/build/cli/install.js unknown; echo exit=$?'`
- **Expected result**:
    - Assert step 1 prints the usage text containing
      `opencode-sdd install - set up the opencode-sdd plugin`, the line
      `opencode-sdd install [-y|--yes]`, and exits 0.
    - Assert steps 2 and 3 print the usage to stderr and exit 1.
- **Evidence**: terminal capture.

## TC-CLI-02 — Interactive install picks the project config (P0)

- **Objective**: Verify the wizard end to end in interactive mode:
  discovery order, prompt text, per-agent model selection with the
  `[recommended]` badge and keyword-priority ordering, diff preview,
  confirmation gate, patch result.
- **Verification**: Run the wizard in the scratch project and inspect
  stdout plus the patched file.
- **Preconditions**: LLM running (default stack); scratch project wired
  per 3.3/3.4 with the `plugin` array REMOVED from `opencode.json` (the
  provider and `model` stay) and no `agent` entries. The 3.4 wiring
  registers the alias models, which is what makes the badge and the
  ordering observable.
- **Steps**:
  1. Remove the plugin entry with your editor:
     `qa exec 'vim opencode.json'` (delete the whole `plugin` array).
  2. `qa exec 'node /app/build/cli/install.js install'`
  3. Answer the target prompt — pick the project config.
  4. Read the `sdd-build` choice list (strong tier), accept it and the
     next four, then read the `sdd-plan-reviewer` list (cheap tier).
  5. For each subagent prompt, keep the recommended model.
  6. Review the printed unified diff, answer the confirm prompt.
- **Expected result**:
    - Assert the target prompt text is `Select the opencode config to
      patch:` and the choice is labeled `[project]
      /work/sdd-manual/opencode.json`.
    - Assert each subagent prompt is `Select a model for <agent>:` and
      lists ONLY `local-llm/*` models (the wiring in 3.4 sets
      `disabled_providers: ["opencode"]`; without it the built-in
      provider's 7 free models are listed FIRST and the local models fall
      below the prompt's 7-item fold).
    - Assert the strong-tier list is, in order:
      `local-llm/deepseek-ling-3.0-tiny [recommended]`,
      `local-llm/qwen-ling-3.0-tiny [recommended]`,
      `local-llm/ling-3.0-tiny`, `local-llm/mimo-ling-3.0-tiny` —
      recommended first, `deepseek` ahead of `qwen` (declaration-order
      priority), non-recommended in input order.
    - Assert the cheap-tier list is
      `local-llm/mimo-ling-3.0-tiny [recommended]` followed by the three
      non-recommended in input order.
    - Assert the diff shows `+ "opencode-sdd"` in `plugin`,
      `+ "model": "local-llm/deepseek-ling-3.0-tiny"` under the 5 strong
      subagents and `+ "model": "local-llm/mimo-ling-3.0-tiny"` under the
      2 cheap ones (the recommended path, NOT the tier fallback).
    - Assert the confirm prompt is `Apply this patch?` and answering
      applies it; exit code 0.
    - Assert `opencode.json` is still valid JSONC (comments/formatting of
      untouched parts preserved).
    - NOTE: with `MODEL_ALIASES=0` wiring, `ling-3.0-tiny` matches none of
      the wizard's keywords (`deepseek`, `qwen`, `mimo`, `gemini`), so no
      badge appears and every agent resolves via the tier fallback to the
      configured `model` — the badge assertions above do not apply.
- **Evidence**: terminal capture; before/after `opencode.json`.
  (Copy the config out if needed: `docker compose -f
  qa/docker-compose.yml cp qa:/work/sdd-manual/opencode.json
  qa/evidence/<date>/`.)

## TC-CLI-03 — Non-interactive install is idempotent (P0)

- **Objective**: Verify `--yes` applies the default without prompting and
  a re-run reports no changes without touching the file.
- **Verification**: stdout, file mtime, unified diff absence.
- **Preconditions**: fresh scratch config (no plugin entry), LLM running.
- **Steps**:
  1. `qa exec 'node /app/build/cli/install.js install --yes; echo
     exit=$?'`
  2. `qa exec 'stat -c "%y %s" opencode.json'` (note mtime and size).
  3. Re-run step 1, then `qa exec 'stat -c "%y %s" opencode.json'` again.
- **Expected result**:
    - Assert first run exits 0, prints `opencode <version> detected`, a
      diff, and no confirmation prompt.
    - Assert `opencode.json` contains `"plugin": ["opencode-sdd"]` and one
      `agent.<subagent>.model` per subagent:
      `local-llm/deepseek-ling-3.0-tiny` for the 5 strong agents and
      `local-llm/mimo-ling-3.0-tiny` for the 2 cheap ones (requires the
      3.4 wiring's `disabled_providers: ["opencode"]`, otherwise the cheap
      agents get the built-in `opencode/mimo-v2.5-free` instead; with
      `MODEL_ALIASES=0` all seven fall back to `local-llm/ling-3.0-tiny`).
    - Assert the re-run prints exactly `install: no changes.`, exits 0, and
      the file mtime/size are unchanged.
- **Evidence**: both command outputs; file mtime.

## TC-CLI-04 — No config found (P1)

- **Objective**: Verify the no-target behavior: `--yes` must fail without
  creating anything; interactive may offer to create a skeleton.
- **Verification**: exit codes and filesystem state.
- **Preconditions**: fresh stack state (`docker compose -f
  qa/docker-compose.yml down -v`, then `qa/scripts/qa-up.sh`) so
  `/home/qa/.config/opencode` and `/work` hold no configs; an empty dir
  `/work/empty`.
  Cheaper alternative — stash both discoverable configs instead of
  resetting the volumes (`mv /work/sdd-manual /stash/...` and
  `mv /home/qa/.config/opencode /stash/...`). If you do, restore with
  `rm -rf` on the target FIRST: the wizard's probe starts an opencode
  server that RE-CREATES `/home/qa/.config/opencode` mid-test, so a plain
  `mv` puts the stash INSIDE the new directory and the global
  `opencode.jsonc` silently disappears from where TC-CLI-02 expects it.
- **Steps**:
  1. `docker compose -f qa/docker-compose.yml exec -it qa bash -lc 'mkdir
     -p /work/empty && cd /work/empty && node /app/build/cli/install.js
     install --yes; echo exit=$?'`
  2. Repeat interactively (no `--yes`) in the same directory.
  3. In the interactive run, choose the "create" option, then decline the
     final confirmation.
  4. Repeat the interactive run once more and ACCEPT the confirmation, to
     cover the create-then-apply path.
- **Expected result**:
    - Assert step 1 prints `install: no resolvable target config. Create
      one or point OPENCODE_CONFIG at one and re-run.` and exits 1; no
      `opencode.json` was created.
    - Assert step 2 offers a choice labeled `Create new config at
      /work/empty/opencode.json`.
    - Assert declining prints `install: declined; no file written.` and
      exits 0 (user choice). NOTE: the minimal skeleton
      (`$schema` + `plugin` + `agent: {}`, 95 B) is written when the
      create choice is accepted, BEFORE the confirmation gate — only the
      per-subagent model patch is declined, so the skeleton file remains.
    - Assert step 4 grows that skeleton to all 7 per-subagent assignments
      (95 B → ~650 B) and exits 0.
    - NOTE: because both configs are absent, nothing declares the
      `local-llm` provider or `disabled_providers`, so the model lists
      here show the built-in **opencode** provider catalog (for example
      `opencode/nemotron-3.5-lightning-free`), NOT the local aliases. That
      is expected for this case — model *identity* is asserted by
      TC-CLI-02/03, and this case only asserts the no-target/create flow.
- **Evidence**: terminal capture; `ls -la /work/empty` before/after.

## TC-CLI-05 — opencode binary missing (P1)

- **Objective**: Verify the prerequisite gate fires before any config
  work, with the install hint.
- **Verification**: stdout/stderr and exit code; no file writes.
- **Preconditions**: scratch config present (plugin entry already there
  from a previous case is fine).
- **Steps**:
  1. Run with a PATH that has node but NOT opencode:
     `qa exec 'mkdir -p /tmp/qa-bin && ln -sf "$(command -v node)"
     /tmp/qa-bin/node && env PATH=/tmp/qa-bin:/usr/bin:/bin node
     /app/build/cli/install.js install --yes; echo exit=$?'`
- **Expected result**:
    - Assert stderr contains the hint
      `opencode binary not found on PATH or failed to run. Install it...`.
    - Assert exit code 1 and `opencode.json` unchanged.
- **Evidence**: terminal capture; config checksum before/after.

## TC-CLI-06 — Malformed config file (P1)

- **Objective**: Verify malformed JSONC yields a clear error, exit 1, and
  leaves the original file intact.
- **Verification**: error text and file contents.
- **Preconditions**: `opencode.json` present and valid.
- **Steps**:
  1. Back up and corrupt it:
     `qa exec 'cp opencode.json opencode.json.bak && echo "{ \"plugin\":
     [\"opencode-sdd\"" > opencode.json'`
     (unbalanced brace — invalid JSONC).
  2. `qa exec 'node /app/build/cli/install.js install --yes; echo
     exit=$?'`
  3. Restore: `qa exec 'mv opencode.json.bak opencode.json'`.
- **Expected result**:
    - Assert stderr is `install: malformed JSONC at <path> (N parse
      error(s))` with N >= 1 (the wizard also warns `model step skipped
      (probe failed: ...)` first — the probe hits the same malformed
      file).
    - Assert exit code 1 and the corrupted file content byte-identical to
      what was written.
- **Evidence**: terminal capture; checksum before/after.

## TC-CLI-07 — Model probe degrades gracefully (P2)

- **Objective**: Verify the wizard still registers the plugin when the
  probe finds no reachable models.
- **Verification**: warning text on stderr, patch result, exit code.
- **Preconditions**: a scratch config WITHOUT the `plugin` array but WITH
  the local provider and `model`, plus BOTH providers disabled:
  `"disabled_providers": ["opencode", "local-llm"]`. The probe must
  enumerate ZERO models, and disabling them is the only reliable way to
  get there: the probe reads config-defined providers and NEVER pings
  them, so stopping the LLM does NOT trigger the degrade path (verified:
  `llm-down.sh` + `--yes` still patches all 7 agent models and exits 0
  with no warning).
- **Steps**:
  1. Add `"disabled_providers": ["opencode", "local-llm"]` to
     `/work/sdd-manual/opencode.json` and remove the `plugin` array.
  2. `qa exec 'node /app/build/cli/install.js install --yes; echo
     exit=$?'`
  3. Restore the config (re-run the 3.4 wiring script).
- **Expected result**:
    - Assert stderr is `install: model step skipped (probe failed: no
      models reachable from the configured providers); the plugin is
      registered without per-subagent model assignments.`
    - Assert the config gains `"plugin": ["opencode-sdd"]`, gains NO
      `agent` key at all, and the wizard exits 0.
- **Evidence**: terminal capture; patched config.

## TC-CLI-08 — Config discovery and duplicate prevention (P2)

- **Objective**: Verify `OPENCODE_CONFIG` is honored and the patch never
  duplicates the plugin entry.
- **Verification**: chosen target, patched content, second-run behavior.
- **Preconditions**: two configs: `/work/sdd-manual/opencode.json`
  (project) and `/work/qa-opencode.json` (env override, copy of the
  project config without the `plugin` array).
- **Steps**:
  1. `docker compose -f qa/docker-compose.yml exec -it qa bash -lc 'cp
     opencode.json /work/qa-opencode.json && python3 -c "import json;
     p=\"/work/qa-opencode.json\"; d=json.load(open(p));
     d.pop(\"plugin\",None); json.dump(d,open(p,\"w\"))" && cd
     /work/sdd-manual && OPENCODE_CONFIG=/work/qa-opencode.json node
     /app/build/cli/install.js install --yes'`
  2. Inspect `/work/qa-opencode.json`.
  3. Re-run step 1, then inspect again.
- **Expected result**:
    - Assert the diff was applied to the PROJECT config `/work/sdd-manual/
      opencode.json` (the `--yes` default priority is project > global >
      env; `OPENCODE_CONFIG` is only the default when neither a project
      nor a global config is discovered).
    - Assert `/work/qa-opencode.json` is byte-identical before and after
      (the env target is NOT patched while a project config exists).
    - Assert `plugin` contains `opencode-sdd` exactly once after re-runs.
    - Assert the second run prints `install: no changes.`.
    - OPTIONAL (pure env path): stash `/work/sdd-manual` and
      `/home/qa/.config` away, then re-run with
      `OPENCODE_CONFIG=/work/qa-opencode.json` — the env file IS patched
      when it is the only candidate.
- **Evidence**: both configs; outputs.
