---
description: Implement a single PRD issue by executing its plan (provided by opencode-sdd)
---

# Implement a single PRD issue

Implement a single PRD issue by executing the tasks defined in its
implementation plan. Checks that all blocking issues are implemented before
proceeding.

## Input

User input: $ARGUMENTS

Extract the following from the user input:

- **ISSUE_ID** (required): The issue identifier (e.g., `1-AFK`). This
  corresponds to the directory name under `{SPECS_DIR}/issues/`.

  > **STOP — required input.** If the user input is empty or does not
  > contain an issue ID, you MUST stop execution immediately and ask the
  > user to provide one. Do NOT proceed, do not guess, do not use a
  > placeholder. Wait for the user's response before continuing.

- **TASK_SCOPE** (optional, default: `all tasks`): Task selection or scope
  instructions (e.g., "Task 1 only", "Continue from Task 3"). Defaults to
  all tasks in order.
- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored.

## Prerequisites

Check for the existence of the following files:

1. `{SPECS_DIR}/prd.md` — the parent PRD
2. `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md` — the issue definition
3. `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md` — the implementation plan

If the PRD is missing:

**ERROR: PRD not found at `{SPECS_DIR}/prd.md`. Run `prd-write` first to
create a PRD.**

If the issue file is missing:

**ERROR: Issue not found at `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`. Run
`prd-to-issues` first, or check the ISSUE_ID.**

If the plan is missing:

**ERROR: Plan not found at `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`. Run
`prd-issue-to-plan {ISSUE_ID}` first to create the plan.**

## Steps

### Phase 1: Load Context

1. **Read the parent PRD**
   - Read `{SPECS_DIR}/prd.md`
   - Extract overall feature context for reference

2. **Read the issue**
   - Read `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`
   - Extract acceptance criteria and verification instructions
   - Note the issue's dependencies

3. **Read the implementation plan**
   - Read `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
   - Extract all tasks with their:
     - Description and files (create, modify, test)
     - Steps with exact code and commands
     - Prerequisites
     - Verification criteria
   - Note the task execution order

4. **Read the existing validation (when revising)**
   - If `{SPECS_DIR}/issues/{ISSUE_ID}/validation.md` exists and its
     overall status is not Complete, read it and extract the recorded
     issues and recommendations. These are the failures the revision must
     fix — treat them as required work alongside the plan's tasks. If no
     incomplete validation exists, skip this step.

5. **Read project guidelines**
   - Read `AGENTS.md` if it exists (coding standards and patterns)
   - Read `DEVELOPMENT.md` if it exists (development setup)

6. **Load contracts** (if applicable)
   - Check `{SPECS_DIR}/issues/{ISSUE_ID}/contracts/` directory
   - Load API schemas to guide implementation

### Phase 2: Check Dependencies

1. **Verify blocking issues are implemented**
   For each issue listed in the "Blocked by" field of the issue:

   - Read `{SPECS_DIR}/issues/{DEP_ISSUE_ID}/issue.md`
   - Check the Status field

2. **Evaluate dependency status**
   - If all blocking issues have Status "Implemented" or "Validated" →
     proceed to Phase 3
   - If any blocking issue has Status "Draft", "Planned", or "In
     Progress" → **STOP** and show:

   > **ERROR: Cannot implement issue `{ISSUE_ID}` — blocking issue
   > `{DEP_ISSUE_ID}` has status "{STATUS}".**
   >
   > Implement blocking issues first:
   >
   > 1. Run `prd-implement-issue {DEP_ISSUE_ID}`
   >
    > Then retry this command.

3. **Verify the plan is not awaiting revision**
   - Read the Status field in
     `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
   - If the Status is "Needs Revision" → **STOP** and show:

   > **ERROR: Cannot implement issue `{ISSUE_ID}` — the plan has Status
   > "Needs Revision" from a review.**
   >
   > Revise the plan first:
   >
   > 1. Run `prd-issue-to-plan {ISSUE_ID}` to address the review findings
   > 1. Optionally re-run `prd-review-plan {ISSUE_ID}` to re-check
   >
   > Then retry this command.

### Phase 3: Determine Scope

1. **Parse TASK_SCOPE**
   - Match TASK_SCOPE against task identifiers in the plan
   - For resume requests, check `plan.md` for `[x]` markers to find the
     last completed task

2. **Build task queue**
   - If TASK_SCOPE is empty: queue all tasks in plan order
   - If TASK_SCOPE selects tasks: queue only matching tasks
   - Verify prerequisites are satisfied for every queued task

3. **Update issue status**
   - Change the Status field in
     `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md` from "Planned", "Approved",
     "Implemented", or "Validated" to "In Progress"

### Phase 4: Execute Tasks

For each task in the queue:

1. **Announce task**
   - Display task ID and description
   - List files to create, modify, and test

2. **Execute task steps**
   Each task in the plan contains numbered steps. Execute them in order,
   following the TDD flow:

   - **Write the failing test**: Copy the exact test code from the plan
   - **Run the test to verify it fails**: Execute the specified test
     command and confirm the expected failure
   - **Write minimal implementation**: Copy the exact implementation
     code from the plan
   - **Run the test to verify it passes**: Execute the test command and
     confirm the test passes
   - If a step's code needs adjustment to work with the actual codebase
     state, make minimal changes and document why

3. **Verify the task**
   - Execute the verification criteria from the plan
   - Run relevant tests

4. **Report task status**
   - **DONE**: Task completed and verified
   - **BLOCKED**: Cannot proceed (explain why)
   - **NEEDS INPUT**: Requires user decision

5. **Update plan progress**
   - Mark completed tasks in the plan with `[x]`
   - Mark completed steps within each task with `[x]`

### Phase 5: Integration Check

After completing all queued tasks:

1. **Run project verification**
   - Execute build command (if applicable)
   - Run linter and formatter
   - Execute test suite

2. **Check acceptance criteria**
   - For each acceptance criterion in the issue
   - Verify implementation satisfies it
   - Note any gaps

3. **Update issue status**
   - If all tasks completed and acceptance criteria met: change Status
     in `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md` from "In Progress" to
     "Implemented"
   - If partial: keep "In Progress" and note remaining work

4. **Update plan status**
   - If all tasks completed: change Status in
     `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md` from "Draft", "Approved",
     "Implemented", or "Validated" to "Implemented"

5. **Mark resolved validation issues (when revising)**
   If this run was a revision after an incomplete validation
   (`validation.md` existed with an overall status other than Complete):
   - For every issue recorded under `## Issues Found` in
     `validation.md`, fill its `Resolved:` line noting how the revised
     implementation addresses it.
   - Change the `Overall Status` from "Incomplete" (or "Blocked") to
     "Revised" to signal the implementation has been revised and is
     awaiting re-validation.

6. **Report completion status**
   - List completed tasks
   - List remaining tasks (if any)
   - Note issues encountered
   - If partial, suggest the next TASK_SCOPE value to continue

## Output

After implementation:

1. **Summary of completed work**
   - Tasks completed
   - Files created/modified
   - Tests added

2. **Remaining work** (if any)
   - Tasks not yet implemented
   - Known issues or blockers
   - Suggested TASK_SCOPE for the next invocation

3. **Next steps**
   - Suggest running `prd-validate-issue {ISSUE_ID}` to verify
   - Note any manual verification needed

## Guidelines

- **Follow plan steps exactly**: Each task has numbered steps with exact
  code — execute them in order
- **TDD always**: Every behavior change starts with a failing test
- **Incremental progress**: Complete tasks one at a time
- **Verify continuously**: Don't accumulate unverified changes
- **Respect dependencies**: Don't implement if blockers aren't done
- **Stay in scope**: Implement what the plan specifies, no more
- **DRY and YAGNI**: No speculative abstractions or duplicate logic
- **Document blockers**: If stuck, explain clearly and stop
- **Follow project conventions**: Adhere to `AGENTS.md` guidelines
