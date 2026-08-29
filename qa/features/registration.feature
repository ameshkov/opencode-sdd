@registration
Feature: Plugin registration and config merging
  A clean opencode startup registers the full plugin surface: 16
  commands, 7 agents, the `sdd-command` global permission deny and the
  template permission grant — without prompting or erroring. These
  cases re-check on the real runtime what the deterministic mock-LLM
  e2e suite also proves; see qa/README.md for the log markers and the
  wiring.

Background:
  Given the scratch project is wired per qa/README.md sections 3.3 and 3.4
  And the plugin is baked into the image at /app
  And I restart opencode after every config change

@TC-REG-01 @P0
Scenario: Fresh registration surface
  When I start opencode with logging: `qa exec 'opencode --log-level DEBUG --print-logs'`
  And I type / in the TUI and list the prd-*, sdd-* and doc-* entries
  And I open the agent selector (Tab) and inspect it
  Then the log contains plugin loading, SDD commands registered with count 16 and SDD agents registered with count 7
  And the log contains no failed to register SDD commands line
  And the / list shows exactly sdd-spec, sdd-implement, sdd-validate, prd-write, prd-to-issues, prd-issue-to-plan, prd-review-plan, prd-implement-issue, prd-validate-issue, prd-validate, prd-auto-implement, doc-readme, doc-development, doc-deployment, doc-agents and doc-changelog
  And the agent selector shows sdd-build and not the six hidden subagents sdd-explore, sdd-planner, sdd-plan-reviewer, sdd-reviewer, sdd-coder and sdd-validator
  And a search for 'descri' shows each command's description ending in (provided by opencode-sdd)
  And I keep opencode.log and screenshots of the / list and the agent selector in the evidence folder

@TC-REG-02 @P0
Scenario: Commands resolve their templates
  When I run /prd-write with fixture F2
  And I watch the first assistant message from sdd-build
  And I grep the log for unresolved and @opencode-sdd-templates
  Then the assistant's message contains the PRD template headings # PRD:, ## Problem Statement, ## Solution and ## User Stories
  And the log contains zero unresolved or opencode-sdd-templates literals
  And I keep the first-message transcript excerpt and the grep result in the evidence folder

@TC-REG-03 @P1
Scenario: User agent settings survive registration
  Given I added `"agent": { "sdd-explore": { "model": "bifrost/openrouter/qwen/qwen3.5-plus-20260420" } }` to /work/sdd-manual/opencode.json
  And that model differs from the global default bifrost/openrouter/deepseek/deepseek-v4-flash
  When I restart opencode and grep the log for agent name collision, merging onto existing config
  And I kick off a run that uses sdd-explore, for example /prd-write or a prd-review-plan dimension
  And I read the gateway log: `qa exec 'curl -fsS "http://bifrost:8080/api/logs?models=qwen3.5-plus-20260420&limit=5"'`
  Then the merge warning appears exactly once for sdd-explore
  And sdd-explore keeps its plugin description, prompt and permission while using the configured model
  And the gateway log shows requests for qwen3.5-plus-20260420 and none for the default deepseek-v4-flash
  And no other user agent keys are touched
  And I keep the log excerpt, the /api/logs excerpt and opencode.json before and after in the evidence folder

@TC-REG-04 @P1
Scenario: Command collision is replaced with a warning
  Given /work/sdd-manual/opencode.json contains `"command": { "prd-validate": { "template": "USER OVERRIDE" } }`
  When I restart opencode and grep the log for command name collision
  And I run /prd-validate
  Then the warning names prd-validate
  And the command body is the plugin's validation report template, not USER OVERRIDE
  And I keep the log excerpt and the TUI command preview in the evidence folder

@TC-REG-05 @P1
Scenario: Template read permission is granted
  When I run /prd-issue-to-plan in the TUI
  And I observe whether any permission question appears for reading /app/build/assets/commands/templates/...
  Then no 'Read file ... ?' approval prompt appears for template paths (only for scratch-project files, if any)
  And the log contains granted external_directory access to bundled templates
  And I keep the log excerpt and a TUI snapshot of the run in the evidence folder
