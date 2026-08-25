# Group B — Plugin registration and config merging

## TC-REG-01 — Fresh registration surface (P0)

- **Objective**: Verify that a clean opencode startup registers the full
  plugin surface: 16 commands, 7 agents, the `sdd-command` global deny,
  the template permission grant — without any prompt or error.
- **Verification**: Log markers from section 3.5, the TUI command list,
  and the agent selector.
- **Preconditions**: scratch project wired per 3.3/3.4; the plugin is
  baked into the image at `/app` (rebuild the image if source changed).
- **Steps**:
  1. (Only after plugin source changes:
     `docker compose -f qa/docker-compose.yml build qa`.) Start opencode
     with logging:
     `qa exec 'opencode --log-level DEBUG --print-logs'`
  2. Type `/` in the TUI; list the `prd-*`, `sdd-*`, and `doc-*` entries.
  3. Open the agent selector (Tab) and inspect it.
- **Expected result**:
    - Assert the log contains `plugin loading`, `SDD commands registered`
      with count 16, and `SDD agents registered` with count 7.
    - Assert no `failed to register SDD commands` line exists.
    - Assert the `/` list shows exactly: `sdd-spec`, `sdd-implement`,
      `sdd-validate`, `prd-write`, `prd-to-issues`, `prd-issue-to-plan`,
      `prd-review-plan`, `prd-implement-issue`, `prd-validate-issue`,
      `prd-validate`, `prd-auto-implement`, `doc-readme`,
      `doc-development`, `doc-deployment`, `doc-agents`, `doc-changelog`.
    - Assert the agent selector shows `sdd-build` and NOT the six subagents
      (`sdd-explore`, `sdd-planner`, `sdd-plan-reviewer`, `sdd-reviewer`,
      `sdd-coder`, `sdd-validator` — all hidden).
    - Assert a search for `"descri` in the TUI shows each command's
      description ending in `(provided by opencode-sdd)`.
- **Evidence**: `opencode.log`; screenshot of `/` list and agent selector.

## TC-REG-02 — Commands resolve their templates (P0)

- **Objective**: Verify the portable token
  `@opencode-sdd-templates/...` is rewritten to the absolute assets path
  and inlined into the prompt — a command must run without "unresolved
  mention" errors.
- **Verification**: Run two commands and inspect the agent's first
  message; grep the log for error strings.
- **Preconditions**: TC-REG-01 passed; LLM running.
- **Steps**:
  1. Run `/prd-write` with fixture F2.
  2. Watch the first assistant message from `sdd-build`.
  3. In the log, grep for `unresolved` and `@opencode-sdd-templates`.
- **Expected result**:
    - Assert the assistant's message contains the PRD template headings
      (`# PRD:`, `## Problem Statement`, `## Solution`, `## User Stories`)
      inlined from the template file.
    - Assert the log contains zero `unresolved` or
      `opencode-sdd-templates` literals.
- **Evidence**: first-message transcript excerpt; grep result.

## TC-REG-03 — User agent settings survive registration (P1)

- **Objective**: Verify the shallow-merge contract: a user-set `model` on
  a plugin agent is preserved while plugin fields still apply.
- **Verification**: Run an agent with a breakpoint `model` and observe
  which model serves the request; inspect the registration log.
- **Preconditions**: TC-REG-01 passed. The `model` used below MUST differ
  from the global default, otherwise the assertion is unfalsifiable — any
  merge outcome looks identical. The 3.4 wiring registers alias ids of the
  same served model for exactly this purpose.
- **Steps**:
  1. Edit `/work/sdd-manual/opencode.json`:
     `qa exec 'vim opencode.json'` — add
     `"agent": { "sdd-explore": { "model": "local-llm/mimo-ling-3.0-tiny" } }`
     (an alias id, distinct from the global
     `model: local-llm/ling-3.0-tiny`).
  2. Restart opencode; in the log grep `agent name collision, merging onto
     existing config`.
  3. Kick off a run that uses `sdd-explore` (e.g. `/prd-write` or a
     `/prd-review-plan` dimension) and verify the request reaches the LLM.
- **Expected result**:
    - Assert the merge warning appears exactly once for `sdd-explore`.
    - Assert `sdd-explore` keeps its plugin `description`, `prompt`,
      `permission` (its behavior is unchanged) while using the configured
      model.
    - Assert the `sdd-explore` sub-session really used
      `mimo-ling-3.0-tiny`, not the global default — check the session's
      model indicator in the TUI (or the request in the server log). This
      is the half that proves the merge preserved the user's `model`.
    - Assert no other user agent keys are touched.
- **Evidence**: log excerpt; `opencode.json` before/after (copied out with
  `docker compose cp qa:/work/sdd-manual/opencode.json ...`).

## TC-REG-04 — Command collision is replaced with a warning (P1)

- **Objective**: Verify user commands colliding with plugin commands are
  fully replaced (the template is the plugin's contract) and logged.
- **Verification**: Log grep and the TUI command body.
- **Preconditions**: scratch project; plugin entry present.
- **Steps**:
  1. Add to `/work/sdd-manual/opencode.json`
     (`qa exec 'vim opencode.json'`):
     `"command": { "prd-validate": { "template": "USER OVERRIDE" } }`.
  2. Restart opencode; grep the log for `command name collision`.
  3. Run `/prd-validate`.
- **Expected result**:
    - Assert the warning names `prd-validate`.
    - Assert the command body is the plugin's validation report template,
      NOT `USER OVERRIDE`.
- **Evidence**: log excerpt; TUI command preview.

## TC-REG-05 — Template read permission is granted (P1)

- **Objective**: Verify workers can read template files through the
  `read` tool without an approval prompt (the
  `external_directory` grant).
- **Verification**: Ask a worker to read a template file; observe no
  approval question in the TUI and a successful read.
- **Preconditions**: TC-REG-01 passed.
- **Steps**:
  1. In the TUI, run `/prd-issue-to-plan` (an agent with
     `sdd-command: true` and template reads).
  2. Observe whether any permission question appears for reading
     `/app/build/assets/commands/templates/...`.
- **Expected result**:
    - Assert no `Read file ... ?` approval prompt appears for template
      paths (only for scratch-project files, if the agent reads them).
    - Assert the log contains `granted external_directory access to bundled
      templates`.
- **Evidence**: log excerpt; TUI snapshot of the run.
