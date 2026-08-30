@prd-flow
Feature: PRD long flow
  Step-by-step commands on fixture F2 ("Add divide(a, b) to src/math.ts
  that throws on division by zero. Single issue, no HITL."). Each case
  builds on the previous; the final case asserts the whole artifact
  tree.

  Model under test: the wired default (deepseek-v4-flash). This group
  asserts real plan/issue/validation QUALITY on a strong model, not just
  template shapes. Re-run with BIFROST_MODEL=anthropic/claude-sonnet-5
  or BIFROST_MODEL=openai/gpt-5.6-luna for a cross-family comparison and
  record the model per run in the evidence notes.

Background:
  Given the LLM is up
  And TC-REG-1 passed
  And all artifacts are under .sdd/.current/
  # Chain semantics: the group resets to the baseline ONCE before
  # TC-PF-01 (see its Given). The later cases build on the previous
  # case's artifacts — the reset is NOT run between chained cases, or
  # the chain breaks.

@TC-PF-01 @P0
Scenario: PRD written
  Given I reset the scratch baseline first: qa exec '/app/qa/docker/reset-scratch.sh /work/sdd-manual'
  When I run /prd-write with fixture F2 (one sentence)
  And I answer any interview questions (the template asks for clarification)
  And I inspect .sdd/.current/prd.md
  Then the file exists and starts with '# PRD:'
  And sections ## Problem Statement, ## Solution, ## Assumptions, ## User Stories and ## Key Entities exist
  And user stories have '(Priority: P1)' and '**Acceptance Scenarios**:'
  And the $ARGUMENTS text (the loop/throw requirement) appears in the Solution section
  And the agent created no files outside .sdd/
  And I keep prd.md and the transcript in the evidence folder

@TC-PF-02 @P0
Scenario: Issues are generated
  Given TC-PF-1 passed
  When I run /prd-to-issues
  And I list the issues: `find .sdd/.current/issues -maxdepth 2 -type f`
  Then there is a directory per issue named <N>-AFK (or <N>-HITL for fixture F3)
  And every issue dir contains one issue.md
  And the issues are vertical slices — the F2 issue includes the divide function, its error contract and the tests, not a list of unrelated chores
  And F2 yields one or more AFK issues and no HITL dir (no human decision needed)
  And I keep the find output and issue.md in the evidence folder
# Note: 'exactly one issue' is intentionally not asserted — the model may
# split F2 into multiple AFK slices (US3 edge cases became a second
# issue). The real assertions are: vertical slices, no HITL dir, one
# issue.md each.

@TC-PF-03 @P1
Scenario: Plan generated; HITL gate honored
  Given TC-PF-2 passed (an AFK issue) — and, for the HITL half, TC-PF-1 and TC-PF-2 redone with fixture F3, keeping at least one issue with an Open before-planning decision
  When I run /prd-issue-to-plan with the F2 issue id
  Then issues/<ID>/plan.md matches the plan template: '# Implementation Plan:', ## Summary, ## Technical Context, ## Entities, ## Contracts, ## File Structure, ## Tasks with '### [ ] Task' entries and '**Verification**:' lines
  And the planner updates statuses: issue.md out of its initial state, plan.md '**Status**: Draft' (or Approved when re-planning)
  And dependencies between tasks are listed where needed
  When I run the planner again with the F3 issue (decision: throw vs return null) and observe the question tool
  And I answer throw on division by zero and answer the follow-up if asked
  Then the decision is asked BEFORE planning (gate before-planning) and the answer is recorded as '## Human Decisions' with '**Status**: Resolved' and '**Answer**:' filled
  And the same decision is NOT asked again at implementation time
  And I keep plan.md and the HITL transcript with the question tool call in the evidence folder
  # F3 recipe: the prd-write interview normally resolves throw-vs-null at
  # PRD time, so the natural breakdown yields AFK issues and the planner
  # correctly does NOT ask. If no issue carries an Open decision, edit
  # issues/<ID>/issue.md's '## Human Decisions' block back to
  # '**Status**: Open' — a tester action, and the gate fires iff a
  # decision is Open. Assert "the gate exists and fires on an Open
  # decision", not "the planner always asks".

@TC-PF-04 @P1
Scenario: Plan review, six dimensions
  Given TC-PF-3 passed
  When I run /prd-review-plan with the same issue id
  And I inspect issues/<ID>/review.md and check plan.md and issue.md statuses
  Then review.md exists with '# Plan Review Report:', ## Per-Dimension Results, ## Consolidated Findings, ## Dismissed Findings and ## Notes
  And the per-dimension results cover all six: Correctness, Security, Performance, Maintainability, Architecture and Operational
  And review.md status is one of Approved / Needs Revision / Revised
  And on Approved: plan.md status is Approved; on Needs Revision: plan.md status is Needs Revision and issue.md status is Reviewing
  And I keep review.md and the status lines from plan.md and issue.md in the evidence folder

@TC-PF-05 @P1
Scenario: Implementation with hard stops
  Given TC-PF-4 passed with an Approved plan
  And a second issue/plan forced into Needs Revision exists for the stop check
  When I run /prd-implement-issue on the Approved plan
  And I observe the agent marking tasks [x] as it goes
  Then implementation follows plan tasks in order, tests come with implementation (TDD), and task lines flip to [x]
  And on a marked In Progress dependency, the command stops with an error naming the dependency file and does NOT edit anything
  When I set plan.md to Needs Revision and re-run
  Then the command stops with the revision error and points the planner at review.md
  And issue.md status becomes Implemented at the end (or remains In Progress when stopped)
  And I keep the transcript excerpts, the plan task markers and the issue status in the evidence folder
  # Recipe for the second issue + Needs Revision state: run /prd-to-issues
  # again on the same PRD (or copy one issue dir) to get issue 2-AFK, run
  # /prd-issue-to-plan for it, and hand-edit plan.md's '**Status**' line
  # to 'Needs Revision' (with /prd-review-plan optionally 'Needs
  # Revision'). Hand-editing statuses mid-run is a tester action — the
  # plan should say so instead of leaving the Given undocumented.

@TC-PF-06 @P0
Scenario: Issue and cross-cutting validation
  Given TC-PF-4 and TC-PF-5 complete (all issues implemented)
  When I run /prd-validate-issue for the issue id
  And I run /prd-validate
  And I list the tree: `find .sdd -maxdepth 2`
  Then issues/<ID>/validation.md matches '# Issue Validation Report:' with ## Summary, ## Task Status, ## Acceptance Criteria Status, ## Entity Status, ## Contract Status, ## Guidelines Compliance, ## Issues Found and ## Recommendations
  And its overall status is one of Complete / Incomplete / Blocked / Revised; for a correct implementation it is Complete
  And cross-cutting .sdd/validation.md follows '# PRD Validation Report:' with ## Summary, ## Issue Status, ## User Story Coverage, ## Success Criteria Status, ## Guidelines Compliance, ## Cross-Cutting Findings and ## Overall Assessment
  And on Complete: prd.md status becomes Validated and .sdd/.current is renamed to .sdd/<yyyymmdd>-<slug>/ containing prd.md, issues/ and validation.md
  And I keep the validation reports and the find .sdd output after the rename in the evidence folder
