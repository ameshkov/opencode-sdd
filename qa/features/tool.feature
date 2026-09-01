@tool
Feature: sdd-command custom tool
  These cases are e2e-proven (mock-LLM test-e2e proves the byte-exact
  tool results); the manual run re-checks them through the real runtime
  by observing the planner's transcript. The tool is denied globally via
  `permission` and allowed per-agent for SDD workers (see qa/README.md).

@TC-TOOL-01 @P1
Scenario: Worker loads an allowlisted command
  Given TC-REG-1 passed and the LLM is running
  And an orchestrator run is the easiest trigger, or I run /prd-auto-implement with the F2 PRD and watch its planner turn
  When I run /prd-auto-implement on the F2 PRD (or delegate the planner manually)
  Then the planner's sdd-command call for prd-issue-to-plan is the pipeline driver: the transcript shows the call (the sdd-command tool step in the sdd-planner session) followed by the task or write steps it unblocked
  And the template read referenced by the rewritten absolute mention (@<abs templates dir>/prd-issue-to-plan/plan-template.md) completes without a permission ask (the TC-REG-5 grant) and feeds the '# Implementation Plan:' the planner wrote
  And the log contains zero @opencode-sdd-templates/ literals
  And I keep the transcript excerpt with the tool call plus the follow-up template read, and the grep result, in the evidence folder
  # Where to look: the planner's session parts in the raw opencode log /
  # saved transcript — the /orchestrator runs print the delegation chain;
  # search for `sdd-command` next to `prd-issue-to-plan`. The exact
  # 'Loaded command ...' result string is proven byte-exact by the
  # mock-LLM e2e only — the session transcript shows the call and its
  # effects, not the raw tool result text.
  # Deterministic alternative (no model whims): drive a worker session
  # headlessly via the opencode server API — `opencode serve` in the
  # container, then POST /session/{id}/message with agent=sdd-planner,
  # and read the parts JSON. The same API route is how a worker's session
  # is continued headlessly (`opencode run -s <session-id>`).

@TC-TOOL-02 @P1
Scenario: Non-allowlisted name fails cleanly
  Given TC-TOOL-1 passed
  When I follow up with the same worker — open its session in the web UI and send a message (or headlessly: POST /session/{id}/message with agent=sdd-planner) — and ask it to call sdd-command with prd-write, then with garbage
  And I read the tool result for each
  Then the error shape is Error: "<name>" is not a loadable command. Available commands: prd-issue-to-plan, prd-review-plan, prd-implement-issue, prd-validate-issue, prd-validate. — the exact string is proven byte-exact by the mock-LLM e2e
  And the session continues — no red banner, no crash
  And I keep the transcript excerpts and confirm the session stays responsive in the evidence folder
  # Worker follow-ups: after the worker's turn its session stays live — a
  # follow-up is a message in that session. Use the web UI path or
  # POST /session/{id}/message with the worker's agent. Do NOT use
  # `opencode run -s <session-id>` for a subagent session: as of opencode
  # 1.18.x the CLI omits the agent, so the server dispatches the default
  # primary agent (build) whose tool set does not include sdd-command —
  # the worker's permission never applies.

@TC-TOOL-02b @P1
Scenario: prd-validate is in the allowlist
  Given TC-TOOL-1 passed and the same wiring
  When I repeat TC-TOOL-1 with prd-validate, ideally from a different worker (for example sdd-validator) to cover a second agent
  Then the result starts with Loaded command "prd-validate" from <abs path>.
  And the report template is referenced as a rewritten absolute mention (@<abs templates dir>/prd-validate/validation-report-template.md), with no @opencode-sdd-templates/ literal
  And the referenced template carries # PRD Validation Report: and ## Overall Assessment
  And I keep the transcript excerpt in the evidence folder
  # Byte-exact 'Loaded command "prd-validate"' + the mention are proven by
  # the mock-LLM e2e (the /validation command runs it end to end too);
  # the manual half is witness+record, not first-time proof.

@TC-TOOL-03 @P2
Scenario: Orchestrator cannot call it
  Given TC-REG-1 passed
  And no leftover plugin entry exists in the global config (the wizard runs in group C may patch ~/.config/opencode/opencode.jsonc with "plugin": ["opencode-sdd"] — restore it; the case must resolve the baked file:///app instance, exactly one plugin registration)
  When I ask sdd-build in a session to use sdd-command directly
  And I read the denied-tool message
  Then the tool is not available to sdd-build — a denial or unknown-tool response
  And the agent instead delegates to a worker
  # Note: the tools['sdd-command'] === false form is ignored by opencode for plugin-registered tools and must not be asserted; only the permission deny takes effect.
  # If the call succeeds anyway, read the loaded source path: a path under
  # ~/.cache/opencode/packages/opencode-sdd@latest/ (instead of
  # /app/build/assets/commands/) means a second registry-cached plugin
  # instance resolved — record it as a DEVIATION of the test state, not a
  # product pass (two instances registering the tool = undefined which one
  # wins).
  And I keep the transcript excerpt in the evidence folder
