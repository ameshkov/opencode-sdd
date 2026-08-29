@robustness
Feature: Robustness and degradation
  How the plugin and opencode survive bad inputs, unavailable assets
  and a provider that disappears — the config hook must degrade
  gracefully (log, never throw), and sessions must stay alive.

@TC-ROB-01 @P1
Scenario: Missing asset directories
  Given the stack is up (the workspace container is built)
  When I start opencode with the asset dirs pointing nowhere: `qa exec 'SDD_COMMANDS_DIR=/nonexistent SDD_TEMPLATES_DIR=/nonexistent SDD_AGENTS_DIR=/nonexistent opencode --print-logs'`
  Then opencode starts — no bootstrap failure, no red banner
  And the log contains 'commands path is not a directory' (loader warning) and 'failed to register SDD commands', and the error is logged, not thrown
  And I keep the opencode log (copied out of the container) and a screenshot of a working TUI in the evidence folder

@TC-ROB-02 @P2
Scenario: Wizard output loads in opencode
  Given the config was patched by the wizard with no manual edits
  When I start opencode: `qa exec 'opencode'`
  Then opencode starts cleanly, the bifrost provider and the allowlisted models are available, and /prd-write runs
  And I keep the log and the first command run in the evidence folder

@TC-ROB-03 @P2
Scenario: Command with no arguments
  When I run /sdd-spec (no input), then /prd-write (no input)
  Then neither command crashes; the agent either asks for the missing description or proceeds with generic instructions
  And I keep the transcripts in the evidence folder

@TC-ROB-04 @P2
Scenario: Deterministic reload
  Given TC-REG-1 was done once in this session
  When I restart opencode and repeat TC-REG-1's command/agent inspection
  Then the counts are identical (16 commands, 7 agents)
  And the log does not show extra registrations or double-counted entries
  And I keep both logs side by side in the evidence folder

@TC-ROB-05 @P1
Scenario: Gateway down
  Given the gateway was up and a session with the plugin loaded exists
  When I run qa/scripts/setup/llm-down.sh (stops the gateway; container, volume and key env kept)
  And I ask the agent a simple question
  Then the failure surfaces as a provider/network error from bifrost — the session stays alive and opencode does not crash
  When I run qa/scripts/setup/llm-up.sh (no key prompt needed — restart only) and ask again
  Then the model responses work again in the same session (or after one opencode restart as documented behavior)
  And I keep the transcript and the /api/logs?status=error excerpt before the restart and status=success after in the evidence folder
