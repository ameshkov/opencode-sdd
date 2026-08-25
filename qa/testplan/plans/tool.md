# Group D — `sdd-command` custom tool

These three cases re-check on a real model what the mock-LLM e2e proves
deterministically; they are the only place the tool is seen through the
real runtime.

## TC-TOOL-01 — Worker loads an allowlisted command (P1)

- **Objective**: Verify a stage worker's `sdd-command` call returns the
  loaded command body with rewritten template references.
- **Verification**: the worker's visible tool result in the TUI
  transcript.
- **Preconditions**: TC-REG-01; LLM running. An orchestrator run is the
  easiest trigger (see TC-ORCH-01) — or run `/prd-issue-to-plan` as a
  subagent task and read its transcript.
- **Steps**:
  1. Run `/prd-auto-implement` on the F2 PRD (or delegate the planner
     manually).
  2. In the transcript, locate the `sdd-command` tool call for
     `prd-issue-to-plan`.
  3. Inspect the tool result text.
- **Expected result**:
    - Assert the result starts with
      `Loaded command "prd-issue-to-plan" from <abs path>.`
    - Assert the body contains the plan template (`# Implementation Plan:`,
      `## Tasks`) and no `@opencode-sdd-templates/` literal.
- **Evidence**: transcript excerpt with the tool call + result.

## TC-TOOL-02 — Non-allowlisted name fails cleanly (P1)

- **Objective**: Verify the fixed error string contract: no exception, no
  crash, exact allowlist text.
- **Verification**: the tool result text in the transcript and session
  health afterwards.
- **Preconditions**: TC-TOOL-01.
- **Steps**:
  1. Ask the worker (in a follow-up message) to call `sdd-command` with
     `prd-write`, then with `garbage`.
  2. Read the tool result for each.
- **Expected result**:
    - Assert the result is exactly
      `Error: "prd-write" is not a loadable command. Available commands:
      prd-issue-to-plan, prd-review-plan, prd-implement-issue,
      prd-validate-issue, prd-validate.`
    - Assert the same shape for the unknown name, with the name quoted.
    - Assert the session continues (no red banner, no crash).
- **Evidence**: transcript excerpts; session still responsive.

## TC-TOOL-02b — `prd-validate` is in the allowlist (P1)

- **Objective**: Verify the fifth entry — the cross-cutting validator
  command — is loadable exactly like the others.
- **Steps**: repeat TC-TOOL-01 with `prd-validate`.
- **Expected result**:
    - Assert `Loaded command "prd-validate" from ...` and the report
      template (`# PRD Validation Report:`, `## Overall Assessment`).
- **Evidence**: transcript excerpt.

## TC-TOOL-03 — Orchestrator cannot call it (P2)

- **Objective**: Verify the global deny: the primary `sdd-build` agent may
  not invoke `sdd-command` directly.
- **Verification**: `tools['sdd-command'] === false` effect on a direct
  attempt.
- **Preconditions**: TC-REG-01.
- **Steps**:
  1. In the TUI as `sdd-build`, ask it to use `sdd-command` directly.
  2. Read the denied-tool message.
- **Expected result**:
    - Assert the tool is not available to `sdd-build` (a denial/unknown
      tool response), and the agent instead delegates to a worker.
- **Evidence**: transcript excerpt.
