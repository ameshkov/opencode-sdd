# Group F — PRD long flow

Step-by-step commands on fixture F2. Each case builds on the previous;
the final case asserts the whole artifact tree.

## TC-PF-01 — PRD written (P0)

- **Objective**: Verify `/prd-write` produces `.sdd/.current/prd.md` from
  the PRD template with the user input captured.
- **Verification**: file assertions; user-input trace.
- **Preconditions**: TC-REG-01; LLM up.
- **Steps**:
  1. Run `/prd-write` with F2 (one sentence).
  2. Answer any interview questions (template asks for clarification).
  3. Inspect `.sdd/.current/prd.md`.
- **Expected result**:
    - Assert the file exists and starts with `# PRD:`.
    - Assert sections `## Problem Statement`, `## Solution`,
      `## Assumptions`, `## User Stories`, `## Key Entities` exist; user
      stories have `(Priority: P1)` and `**Acceptance Scenarios**:`.
    - Assert the `$ARGUMENTS` text (the loop/throw requirement) appears in
      the Solution section.
    - Assert the agent created no files outside `.sdd/`.
- **Evidence**: `prd.md`; transcript.

## TC-PF-02 — Issues are generated (P0)

- **Objective**: Verify `/prd-to-issues` slices the PRD into AFK/HITL
  issue directories with the right structure.
- **Verification**: directory/file assertions.
- **Preconditions**: TC-PF-01.
- **Steps**:
  1. Run `/prd-to-issues`.
  2. `find .sdd/.current/issues -maxdepth 2 -type f`
- **Expected result**:
    - Assert a directory per issue named `<N>-AFK` (or `<N>-HITL` for F3).
    - Assert every issue dir contains one `issue.md`.
    - Assert the issue(s) are vertical slices — the F2 issue includes the
      divide function, its error contract, and the tests — not a list of
      unrelated chores.
    - Assert F2 yields exactly one issue and NO HITL dir (no human decision
      needed).
- **Evidence**: `find` output; `issue.md`.

## TC-PF-03 — Plan generated; HITL gate honored (P1)

- **Objective**: Verify `/prd-issue-to-plan` writes a plan from the plan
  template, updates statuses, and handles HITL decisions at their gate.
- **Verification**: file assertions for AFK run; question-tool
  observation for HITL run (fixture F3).
- **Preconditions**: TC-PF-02 (AFK issue) — and, for the HITL half,
  redo 01/02 with F3.
- **Steps**:
  1. AFK: run `/prd-issue-to-plan` with the F2 issue id.
  2. HITL: with the F3 issue (decision: throw vs return null), run the
     planner again and observe the `question` tool.
  3. Answer "throw on division by zero"; answer the follow-up if asked.
- **Expected result**:
    - Assert `issues/<ID>/plan.md` matches the plan template:
      `# Implementation Plan:`, `## Summary`, `## Technical Context`,
      `## Entities`, `## Contracts`, `## File Structure`,
      `## Tasks` with `### [ ] Task` entries and `**Verification**:` lines.
    - Assert planner updates statuses: `issue.md` out of its initial state,
      `plan.md` `**Status**: Draft` (or Approved when re-planning).
    - Assert dependencies between tasks are listed where needed.
    - HITL: Assert the decision is asked BEFORE planning (gate
      `before-planning`) and the answer is recorded as `## Human Decisions`
      with `**Status**: Resolved` and `**Answer**:` filled; afterwards the
      same decision is NOT asked again at implementation time.
- **Evidence**: `plan.md`; HITL transcript with the question tool call.

## TC-PF-04 — Plan review, six dimensions (P1)

- **Objective**: Verify `/prd-review-plan` writes a review report covering
  the six dimensions and applies a verdict to plan/issue.
- **Verification**: file assertions and status transitions.
- **Preconditions**: TC-PF-03.
- **Steps**:
  1. Run `/prd-review-plan` with the same issue id.
  2. Inspect `issues/<ID>/review.md`; check `plan.md` and `issue.md`
     statuses.
- **Expected result**:
    - Assert `review.md` exists with `# Plan Review Report:`,
      `## Per-Dimension Results`, `## Consolidated Findings`,
      `## Dismissed Findings`, `## Notes`.
    - Assert the per-dimension results cover all six: Correctness,
      Security, Performance, Maintainability, Architecture, Operational.
    - Assert `review.md` status is one of Approved / Needs Revision /
      Revised.
    - Assert on Approved: `plan.md` status `Approved`; on Needs Revision:
      `plan.md` status `Needs Revision` and `issue.md` status `Reviewing`.
- **Evidence**: `review.md`; status lines from `plan.md` and `issue.md`.

## TC-PF-05 — Implementation with hard stops (P1)

- **Objective**: Verify `/prd-implement-issue` implements the approved
  plan task-by-task and hard-stops on unmet dependency or a plan needing
  revision.
- **Verification**: transcript tool-call order, statuses, hard-stop
  transcript.
- **Preconditions**: TC-PF-04 with an Approved plan; a second
  issue/plan forced into `Needs Revision` for the stop check.
- **Steps**:
  1. On the Approved plan: run `/prd-implement-issue`.
  2. Observe the agent marking tasks `[x]` as it goes.
  3. For the stop check, set `plan.md` to `Needs Revision` and re-run.
- **Expected result**:
    - Assert implementation follows plan tasks in order, tests come with
      implementation (TDD), and task lines flip to `[x]`.
    - Assert dependency stop: with a marked In Progress dependency, the
      command stops with an error naming the dependency file and does NOT
      edit anything.
    - Assert revision stop: with `Needs Revision`, the command stops with
      the revision error and points the planner at `review.md`.
    - Assert `issue.md` status becomes Implemented at the end (or remains
      In Progress when stopped).
- **Evidence**: transcript excerpts; plan task markers; issue status.

## TC-PF-06 — Issue and cross-cutting validation (P0)

- **Objective**: Verify `/prd-validate-issue` and `/prd-validate` produce
  the two validation reports and finalize the feature on Complete.
- **Verification**: file assertions and directory rename.
- **Preconditions**: TC-PF-04/05 complete (all issues implemented).
- **Steps**:
  1. Run `/prd-validate-issue` for the issue id.
  2. Run `/prd-validate`.
  3. `find .sdd -maxdepth 2`
- **Expected result**:
    - Assert `issues/<ID>/validation.md` matches
      `# Issue Validation Report:` with `## Summary`, `## Task Status`,
      `## Acceptance Criteria Status`, `## Entity Status`,
      `## Contract Status`, `## Guidelines Compliance`, `## Issues Found`,
      `## Recommendations`.
    - Assert its overall status is one of Complete / Incomplete / Blocked /
      Revised; for a correct implementation it is Complete.
    - Assert cross-cutting `.sdd/validation.md` follows
      `# PRD Validation Report:` with `## Summary`, `## Issue Status`,
      `## User Story Coverage`, `## Success Criteria Status`,
      `## Guidelines Compliance`, `## Cross-Cutting Findings`,
      `## Overall Assessment`.
    - Assert on Complete: `prd.md` status becomes `Validated` and
      `.sdd/.current` is renamed to `.sdd/<yyyymmdd>-<slug>/` containing
      `prd.md`, `issues/`, and `validation.md`.
- **Evidence**: validation reports; `find .sdd` after rename.
