@tool
Feature: sdd-command custom tool
  These cases re-check on a real model what the mock-LLM e2e proves
  deterministically; they are the only place the tool is seen through
  the real runtime. The tool is denied globally via `permission` and
  allowed per-agent for SDD workers (see qa/README.md).

@TC-TOOL-01 @P1
Scenario: Worker loads an allowlisted command
  Given TC-REG-1 passed and the LLM is running
  And an orchestrator run is the easiest trigger, or I run /prd-issue-to-plan as a subagent task and read its transcript
  When I run /prd-auto-implement on the F2 PRD (or delegate the planner manually)
  And I locate the sdd-command tool call for prd-issue-to-plan in the transcript
  And I inspect the tool result text
  And I ask the same worker to read the template path the result references
  Then the result starts with Loaded command "prd-issue-to-plan" from <abs path>. followed by a blank line
  And the body references the plan template as a rewritten absolute mention (@<abs templates dir>/prd-issue-to-plan/plan-template.md) and contains no @opencode-sdd-templates/ literal
  And the worker's read of that path completes without a permission ask (the TC-REG-5 templates grant) and returns the template carrying # Implementation Plan: and ## Tasks
  And I keep the transcript excerpt with the tool call plus result, and the follow-up read result, in the evidence folder

@TC-TOOL-02 @P1
Scenario: Non-allowlisted name fails cleanly
  Given TC-TOOL-1 passed
  When I ask the worker (in a follow-up message) to call sdd-command with prd-write, then with garbage
  And I state that the error path itself is the point — a tiny model otherwise 'helpfully' answers from memory without ever calling the tool
  And I read the tool result for each
  Then the prd-write result is exactly Error: "prd-write" is not a loadable command. Available commands: prd-issue-to-plan, prd-review-plan, prd-implement-issue, prd-validate-issue, prd-validate.
  And the unknown name has the same shape with the name quoted
  And the session continues — no red banner, no crash
  And I keep the transcript excerpts and confirm the session stays responsive in the evidence folder

@TC-TOOL-02b @P1
Scenario: prd-validate is in the allowlist
  Given TC-TOOL-1 passed and the same wiring
  When I repeat TC-TOOL-1 with prd-validate, ideally from a different worker (for example sdd-validator) to cover a second agent
  Then the result starts with Loaded command "prd-validate" from <abs path>.
  And the report template is referenced as a rewritten absolute mention (@<abs templates dir>/prd-validate/validation-report-template.md), with no @opencode-sdd-templates/ literal
  And the referenced template carries # PRD Validation Report: and ## Overall Assessment
  And I keep the transcript excerpt in the evidence folder

@TC-TOOL-03 @P2
Scenario: Orchestrator cannot call it
  Given TC-REG-1 passed
  When I ask sdd-build in the TUI to use sdd-command directly
  And I read the denied-tool message
  Then the tool is not available to sdd-build — a denial or unknown-tool response
  And the agent instead delegates to a worker
  # Note: the tools['sdd-command'] === false form is ignored by opencode for plugin-registered tools and must not be asserted; only the permission deny takes effect.
  And I keep the transcript excerpt in the evidence folder
