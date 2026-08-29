@cli
Feature: CLI install wizard
  The wizard runs from the baked build inside the workspace:
  `qa exec 'node /app/build/cli/install.js ...'` (opencode-sdd is the
  installed bin name). These cases are the only place the wizard is
  exercised end to end. They cost no inference tokens: the probe only
  reads the project config, never the network, so the gateway's state
  is irrelevant — the model lists are the ones declared in
  opencode.json (see qa/README.md section 3.4).

Background:
  Given the stack is up (qa/scripts/setup/qa-up.sh)
  And the scratch project is wired per qa/README.md sections 3.3 and 3.4

@TC-CLI-01 @P1
Scenario: Usage and argument handling
  When I run `--help`: `qa exec 'node /app/build/cli/install.js install --help; echo exit=$?'`
  And I run a bogus flag: `qa exec 'node /app/build/cli/install.js install --bogus; echo exit=$?'`
  And I run an unknown subcommand: `qa exec 'node /app/build/cli/install.js unknown; echo exit=$?'`
  Then the --help output prints the usage containing opencode-sdd install - set up the opencode-sdd plugin and the line opencode-sdd install [-y|--yes] and exits 0
  And the bogus flag and the unknown subcommand print the usage to stderr and exit 1
  And I keep the terminal capture in the evidence folder

@TC-CLI-02 @P0
Scenario: Interactive install picks the project config
  Given opencode.json has the plugin array REMOVED and no agent entries (the provider and model stay)
  And the wiring registers the six-model allowlist including the wizard keyword families deepseek and qwen (strong tier) and mimo and gemini (cheap tier)
  When I run the wizard: `qa exec 'node /app/build/cli/install.js install'`
  And I answer the target prompt — pick the project config
  And I read the sdd-build choice list (strong tier)
  And I accept it and the next four
  And I read the sdd-plan-reviewer list (cheap tier)
  And for each subagent prompt I keep the recommended model
  And I review the printed unified diff and answer the confirm prompt
  Then the target prompt text is Select the opencode config to patch: and the choice is labeled [project] /work/sdd-manual/opencode.json
  And each subagent prompt is Select a model for <agent>: and lists only bifrost/* models
  And the strong-tier list is, in order: bifrost/openrouter/deepseek/deepseek-v4-flash [recommended], bifrost/openrouter/qwen/qwen3.5-plus-20260420 [recommended], bifrost/openrouter/xiaomi/mimo-v2.5, bifrost/openrouter/google/gemini-3.1-flash-lite, bifrost/openrouter/anthropic/claude-sonnet-5, bifrost/openrouter/openai/gpt-5.6-luna
  And the cheap-tier list is bifrost/openrouter/xiaomi/mimo-v2.5 [recommended], bifrost/openrouter/google/gemini-3.1-flash-lite [recommended] followed by the four non-recommended in allowlist order
  And the diff shows `+ "opencode-sdd"` in plugin and the recommended model per strong and cheap subagent
  And the confirm prompt is Apply this patch? and answering it applies the patch with exit code 0
  And opencode.json is still valid JSONC with comments and formatting of untouched parts preserved
  And I keep the terminal capture and the before and after opencode.json in the evidence folder
  # Note: these assertions follow the default allowlist order — if the run was re-wired with BIFROST_MODEL or the allowlist edited, read the list from `qa exec 'cat opencode.json'` before asserting.

@TC-CLI-03 @P0
Scenario: Non-interactive install is idempotent
  Given a fresh scratch config with no plugin entry
  And the gateway is running (the probe never pings it)
  When I run `qa exec 'node /app/build/cli/install.js install --yes; echo exit=$?'`
  And I note the file mtime and size with `stat`
  And I re-run the same command and stat the file again
  Then the first run exits 0 and prints opencode <version> detected, a diff, and no confirmation prompt
  And opencode.json contains `"plugin": ["opencode-sdd"]` and one agent.<subagent>.model per subagent: deepseek for the 5 strong agents and mimo for the 2 cheap ones
  And the re-run prints exactly install: no changes., exits 0, and the file mtime and size are unchanged
  And I keep both command outputs and the file mtime in the evidence folder

@TC-CLI-04 @P1
Scenario: No config found
  Given no discoverable config exists in /home/qa/.config/opencode or /work (either down -v, or both configs stashed)
  And an empty dir /work/empty exists
  When I run `install --yes` from /work/empty: `docker compose -f qa/docker-compose.yml exec -it qa bash -lc 'mkdir -p /work/empty && cd /work/empty && node /app/build/cli/install.js install --yes; echo exit=$?'`
  Then it prints install: no resolvable target config. Create one or point OPENCODE_CONFIG at one and re-run. and exits 1
  And no opencode.json was created
  When I run interactively in the same directory
  Then it offers a choice labeled Create new config at /work/empty/opencode.json
  And declining prints install: declined; no file written. and exits 0, but the minimal skeleton ($schema plus plugin plus agent:{}, 95 B) was already written before the confirmation gate
  When I run interactively again and ACCEPT the confirmation
  Then it grows the skeleton to all 7 per-subagent assignments (about 650 B) and exits 0
  And the model lists show the built-in opencode provider catalog (for example opencode/nemotron-3.5-lightning-free), not the QA allowlist — expected, since no config declares bifrost here
  And I keep the terminal capture and ls -la /work/empty before and after in the evidence folder
  # Note: restore the stashed configs with `rm -rf` on the target first — the probe re-creates /home/qa/.config/opencode mid-test.

@TC-CLI-05 @P1
Scenario: opencode binary missing
  Given a scratch config present (a plugin entry from a previous case is fine)
  When I run with a PATH that has node but not opencode: `qa exec 'mkdir -p /tmp/qa-bin && ln -sf "$(command -v node)" /tmp/qa-bin/node && env PATH=/tmp/qa-bin:/usr/bin:/bin node /app/build/cli/install.js install --yes; echo exit=$?'`
  Then stderr contains the hint opencode binary not found on PATH or failed to run. Install it...
  And the exit code is 1 and opencode.json is unchanged
  And I keep the terminal capture and the config checksum before and after in the evidence folder

@TC-CLI-06 @P1
Scenario: Malformed config file
  Given opencode.json is present and valid
  When I back it up and corrupt it (an unbalanced brace — invalid JSONC): `qa exec 'cp opencode.json opencode.json.bak && echo "{ \"plugin\": [\"opencode-sdd\"" > opencode.json'`
  And I run `install --yes` and then restore the backup with `mv`
  Then stderr is install: malformed JSONC at <path> (N parse error(s)) with N >= 1 (the probe also warns model step skipped (probe failed: ...) first)
  And the exit code is 1 and the corrupted file content is byte-identical to what was written
  And I keep the terminal capture and the checksum before and after in the evidence folder

@TC-CLI-07 @P2
Scenario: Model probe degrades gracefully
  Given a scratch config without the plugin array but with the bifrost provider and model, plus `"disabled_providers": ["opencode", "bifrost"]` (the only reliable way to get zero models: the probe never pings providers)
  When I run `install --yes`: `qa exec 'node /app/build/cli/install.js install --yes; echo exit=$?'`
  Then stderr is install: model step skipped (probe failed: no models reachable from the configured providers); the plugin is registered without per-subagent model assignments.
  And the config gains `"plugin": ["opencode-sdd"]`, gains no agent key at all, and the wizard exits 0
  And I restore the config with the wiring script
  And I keep the terminal capture and the patched config in the evidence folder

@TC-CLI-08 @P2
Scenario: Config discovery and duplicate prevention
  Given two configs: /work/sdd-manual/opencode.json (project, with the plugin array) and /work/qa-opencode.json (env override, a copy without the plugin array)
  When I run with OPENCODE_CONFIG set from the project dir: `docker compose -f qa/docker-compose.yml exec -it qa bash -lc 'cp opencode.json /work/qa-opencode.json && python3 -c "import json; p=\"/work/qa-opencode.json\"; d=json.load(open(p)); d.pop(\"plugin\",None); json.dump(d,open(p,\"w\"))" && cd /work/sdd-manual && OPENCODE_CONFIG=/work/qa-opencode.json node /app/build/cli/install.js install --yes'`
  And I inspect /work/qa-opencode.json and re-run the same command
  Then the diff applies to the PROJECT config /work/sdd-manual/opencode.json, not the env one (project > global > env priority)
  And /work/qa-opencode.json is byte-identical before and after
  And plugin contains opencode-sdd exactly once after re-runs
  And the second run prints install: no changes.
  # Note: the pure env path — stash /work/sdd-manual and /home/qa/.config away and re-run; the env file IS patched when it is the only candidate.
  And I keep both configs and the outputs in the evidence folder
