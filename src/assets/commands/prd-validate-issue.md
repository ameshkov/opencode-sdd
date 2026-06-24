---
description: Validate a single PRD issue's implementation against its plan (provided by opencode-sdd)
---

# Validate a single PRD issue implementation

Verify that a single PRD issue has been fully implemented according to its
plan and acceptance criteria. Produces a validation report for the issue.

## Input

User input: $ARGUMENTS

Extract the following from the user input:

- **ISSUE_ID** (required): The issue identifier (e.g., `1-AFK`). This
  corresponds to the directory name under `{SPECS_DIR}/issues/`.

  > **STOP — required input.** If the user input is empty or does not
  > contain an issue ID, you MUST stop execution immediately and ask the
  > user to provide one. Do NOT proceed, do not guess, do not use a
  > placeholder. Wait for the user's response before continuing.

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored.

## Prerequisites

Check for the existence of the following files:

1. `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md` — the issue definition
2. `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md` — the implementation plan

If the issue file is missing:

**ERROR: Issue not found at `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`. Check
the ISSUE_ID.**

If the plan is missing:

**ERROR: Plan not found at `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`. Run
`prd-issue-to-plan {ISSUE_ID}` first.**

## Steps

### Phase 1: Load Documentation

1. **Read the issue**
   - Read `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`
   - Extract:
     - What to build (vertical slice description)
     - Acceptance criteria
     - Verification instructions
     - User stories addressed

2. **Read the implementation plan**
   - Read `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
   - Extract:
     - All tasks with their verification criteria
     - Entity definitions
     - API contracts (if applicable)
     - File structure changes

3. **Read any contract files**
   - Check `{SPECS_DIR}/issues/{ISSUE_ID}/contracts/` directory
   - Load OpenAPI or GraphQL schemas if present

4. **Read project guidelines**
   - Read `AGENTS.md` if it exists
   - Extract Code Guidelines and Contribution Instructions

5. **Read the prior validation (when re-validating)** — If
   `{SPECS_DIR}/issues/{ISSUE_ID}/validation.md` already exists, this is
   a re-validation of a revised implementation. Read its overall status
   and the issues recorded under `## Issues Found` (including any
   `Resolved:` notes the revision filled in). Carry each prior issue
   into Phase 2 and the later phases and specifically verify the revised
   implementation resolves it; an unresolved prior issue must be reported
   again. If no prior validation exists, skip this step.

### Phase 2: Task Verification

For each task in the implementation plan:

1. **Check task completion**
   Delegate the file locating and reading to the `explore` subagent via
   the Task tool (`subagent_type: "explore"`). Give it the task's file
   list and ask it to report whether the described implementation
   exists and what it contains. It is read-only and returns findings;
   do not write files from this step. You retain the run/judgment in
   the last bullet.

   - Locate the files/code mentioned in the task
   - Verify the implementation exists
   - Run the verification criteria specified in the task

2. **Record task status**
   - **PASS**: Task is fully implemented and verified
   - **PARTIAL**: Task is implemented but verification incomplete
   - **FAIL**: Task is not implemented or verification fails
   - **SKIP**: Task was intentionally skipped (note reason)

### Phase 3: Acceptance Criteria Verification

For each acceptance criterion in the issue:

1. **Trace criterion to implementation**
   - Find the code that satisfies this criterion
   - Verify the implementation matches

2. **Check Given/When/Then scenarios**
   - Verify each scenario can be executed successfully
   - Check edge cases are handled

3. **Record criterion status**
   - **MET**: Criterion is fully satisfied
   - **PARTIAL**: Criterion is partially implemented
   - **NOT MET**: Criterion is missing
   - **DEVIATION**: Implementation differs (note details)

### Phase 4: Entity Verification

Skip if the issue does not involve data entities.

For each entity defined in the plan:

1. **Verify entity exists**
   - Check database schema/models
   - Verify all fields are present with correct types

2. **Verify relationships**
   - Check foreign keys and associations
   - Verify cardinality matches the plan

3. **Verify validation rules**
   - Check that validation constraints are implemented

### Phase 5: Contract Verification

Skip if no contracts exist.

1. **Verify API endpoints**
   - Check each endpoint exists
   - Verify request/response schemas match contracts
   - Check error responses are implemented

### Phase 6: Guidelines Verification

Skip if `AGENTS.md` does not exist.

For each Code Guideline in `AGENTS.md`:

1. **Check guideline compliance**
   - Identify which guidelines apply to the changed files
   - Verify the implementation follows each applicable guideline

2. **Record guideline status**
   - **COMPLIANT**: Implementation follows the guideline
   - **NON-COMPLIANT**: Implementation violates the guideline
   - **N/A**: Guideline does not apply

### Phase 7: Generate Validation Report

1. **Write the validation report**
   - Write to `{SPECS_DIR}/issues/{ISSUE_ID}/validation.md`
   - Use the validation report template below
   - Replace all placeholders with concrete details

2. **Update issue status** (if overall status is Complete)
   - Change Status in `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md` from
     "Implemented" to "Validated"
   - Change Status in `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md` from
     "Implemented" to "Validated"

3. **Display the validation report** in the chat

## Validation Report Template

Read and follow the validation report template:

@opencode-sdd-templates/prd-validate-issue/validation-report-template.md

## Guidelines

- **Evidence-based**: Every status must have supporting evidence
- **Non-destructive**: Only read and verify, never modify code
- **Comprehensive**: Check all items, don't skip any
- **Actionable**: Issues must include clear recommendations
- **Objective**: Report actual state, not expected state
- **Scoped to the issue**: Only validate work within this issue's
  vertical slice
