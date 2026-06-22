---
title: sdd-validate
description: Validate an implemented quick spec and produce a report
---

Verify that a feature specification has been fully implemented according to
its implementation plan. Both full specifications (spec.md + plan.md) and
quick specifications (quick.md) are supported.

Specs directory path or empty for default (`.sdd/.current/`): $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored. Defaults to `.sdd/.current/`. If not
  specified, use `.sdd/.current/`.

## Prerequisites

Check for specification files in `SPECS_DIR/`:

1. **Full spec mode**: Both `SPECS_DIR/spec.md` AND `SPECS_DIR/plan.md`
   exist
2. **Quick spec mode**: `SPECS_DIR/quick.md` exists

Determine validation mode:

- If both full spec files exist → use **Full Validation** (Phases 1-8)
- If only `quick.md` exists → use **Quick Validation** (Phase Q)
- If both exist → prefer **Full Validation** (quick.md is likely outdated)
- If neither exists → show error below

**ERROR (if no specs found)**: Required files not found. Run `sdd-spec` and
`sdd-plan` for full specifications, or `sdd-quickspec` for quick fixes.

## Steps

### Phase 1: Load Documentation

1. **Read the feature specification**
   - Read `SPECS_DIR/spec.md`
   - Extract:
     - Functional requirements (FR-XXX items)
     - User stories and acceptance scenarios
     - Success criteria (SC-XXX items)
     - Key entities

2. **Read the implementation plan**
   - Read `SPECS_DIR/plan.md`
   - Extract:
     - All tasks with their verification criteria
     - Entity definitions
     - API contracts (if applicable)
     - Project structure changes

3. **Read any contract files**
   - Check `SPECS_DIR/contracts/` directory
   - Load OpenAPI or GraphQL schemas if present

4. **Read project guidelines**
   - Read `AGENTS.md` if it exists
   - Extract Code Guidelines and Contribution Instructions
   - These define coding standards the implementation must follow

### Phase 2: Task Verification

For each task in the implementation plan:

1. **Check task completion**
   - Locate the files/code mentioned in the task
   - Verify the implementation exists
   - Run the verification criteria specified in the task

2. **Record task status**
   - **PASS**: Task is fully implemented and verified
   - **PARTIAL**: Task is implemented but verification incomplete
   - **FAIL**: Task is not implemented or verification fails
   - **SKIP**: Task was intentionally skipped (note reason)

### Phase 3: Requirement Verification

For each functional requirement (FR-XXX) in the specification:

1. **Trace requirement to implementation**
   - Find the code that implements this requirement
   - Verify the implementation matches the requirement

2. **Check acceptance scenarios**
   - For each Given/When/Then scenario in user stories
   - Verify the scenario can be executed successfully
   - Check edge cases are handled

3. **Record requirement status**
   - **IMPLEMENTED**: Requirement is fully satisfied
   - **PARTIAL**: Requirement is partially implemented
   - **NOT IMPLEMENTED**: Requirement is missing
   - **DEVIATION**: Implementation differs from spec (note details)

### Phase 4: Entity Verification

For each entity defined in the plan:

1. **Verify entity exists**
   - Check database schema/models
   - Verify all fields are present with correct types

2. **Verify relationships**
   - Check foreign keys and associations
   - Verify cardinality matches the plan

3. **Verify validation rules**
   - Check that validation constraints are implemented

### Phase 5: Contract Verification (if applicable)

Skip if no contracts exist in `SPECS_DIR/contracts/`.

1. **Verify API endpoints**
   - Check each endpoint exists
   - Verify request/response schemas match contracts
   - Check error responses are implemented

2. **Run contract tests**
   - If contract tests exist, execute them
   - Note any failures

### Phase 6: Guidelines Verification

Skip if `AGENTS.md` does not exist.

For each Code Guideline in `AGENTS.md`:

1. **Check guideline compliance**
   - Identify which guidelines apply to the changed or created files
   - Verify the implementation follows each applicable guideline
   - Check Contribution Instructions for any required steps

2. **Record guideline status**
   - **COMPLIANT**: Implementation follows the guideline
   - **NON-COMPLIANT**: Implementation violates the guideline (note
     details)
   - **N/A**: Guideline does not apply to this feature

### Phase 7: Success Criteria Verification

For each success criterion (SC-XXX) in the specification:

1. **Evaluate measurability**
   - Can this criterion be measured with current implementation?
   - What evidence supports meeting this criterion?

2. **Record criterion status**
   - **MET**: Criterion is demonstrably satisfied
   - **PARTIALLY MET**: Some aspects satisfied
   - **NOT MET**: Criterion is not satisfied
   - **CANNOT VERIFY**: Requires manual testing or production data

### Phase 8: Generate Validation Report

1. **Write the validation report**
   - Write to `SPECS_DIR/validation.md`
   - Use the validation report template below
   - Replace all placeholders with concrete details
   - If overall status is COMPLETE, also update spec and plan status:
     change status from "Implemented" to "Validated" in both
     `SPECS_DIR/spec.md` and `SPECS_DIR/plan.md`

## Phase Q: Quick Spec Validation

**Use this phase when only `SPECS_DIR/quick.md` exists.**

Skip Phases 1-8 and perform simplified validation:

### Q.1: Load Quick Spec

1. **Read the quick spec**
   - Read `SPECS_DIR/quick.md`
   - Extract:
     - Problem statement
     - Root cause analysis
     - Affected files list
     - Proposed solution
     - Tasks and their verification criteria
     - Verification checklist

2. **Read project guidelines**
   - Read `AGENTS.md` if it exists
   - Extract Code Guidelines and Contribution Instructions
   - These define coding standards the implementation must follow

### Q.2: Verify Affected Files

For each file listed in the "Affected Files" section:

1. **Check file exists**
   - Verify the file is present in the codebase

2. **Verify changes were made**
   - Check that the file was modified as described
   - Look for the specific changes mentioned in the solution

3. **Record file status**
   - **MODIFIED**: File was changed as expected
   - **UNCHANGED**: File exists but wasn't modified
   - **MISSING**: File doesn't exist

### Q.3: Verify Tasks

For each task in the "Tasks" section of the quick spec:

1. **Check task completion**
   - Locate the files/code mentioned in the task
   - Verify the implementation exists
   - Run the task-level verification criteria

2. **Record task status**
   - **PASS**: Task is fully implemented and verified
   - **FAIL**: Task is not implemented or verification fails
   - **SKIP**: Task was intentionally skipped (note reason)

### Q.4: Run Verification Checklist

For each item in the "Verification" section of the quick spec:

1. **Execute verification step**
   - Run commands, check files, or perform manual verification
   - Note the outcome

2. **Record verification status**
   - **PASS**: Verification step succeeded
   - **FAIL**: Verification step failed
   - **SKIP**: Cannot verify (note reason)

### Q.5: Verify Guidelines

Skip if `AGENTS.md` does not exist.

For each Code Guideline in `AGENTS.md`:

1. **Check guideline compliance**
   - Identify which guidelines apply to the changed or created files
   - Verify the implementation follows each applicable guideline
   - Check Contribution Instructions for any required steps

2. **Record guideline status**
   - **COMPLIANT**: Implementation follows the guideline
   - **NON-COMPLIANT**: Implementation violates the guideline (note
     details)
   - **N/A**: Guideline does not apply to this task

### Q.6: Generate Quick Validation Report

1. **Write the quick validation report**
   - Write to `SPECS_DIR/validation.md`
   - Use the quick validation report template below
   - Replace all placeholders with concrete details
   - If overall status is COMPLETE, also change status from "Implemented"
     to "Validated" in `SPECS_DIR/quick.md`

## Finalize Specs Directory

**Applies to both Full and Quick validation. Only execute when overall
status is COMPLETE.**

If `SPECS_DIR` path ends with `.current` (the temporary work directory):

1. **Derive feature directory name**
   - Extract the feature name or problem title from the specification
   - Convert to a kebab-case short description (maximum 60 characters)
   - Format the new directory name as `yyyymmdd-SHORT_DESCRIPTION` where
     `dd`, `mm`, `yyyy` are the current day, month, and year
   - Example: `.sdd/.current` → `.sdd/20260323-add-user-authentication`

2. **Rename the directory**
   - Rename the `.current` directory to the derived name within the same
     parent directory

## Validation Report Templates

Full validation — read and follow the validation report template:

@opencode-sdd-templates/sdd-validate/validation-report-template.md

Quick validation — read and follow the quick validation report template:

@opencode-sdd-templates/sdd-validate/quick-validation-report-template.md

## Output

1. **Write the validation report** to `SPECS_DIR/validation.md`
2. **Display the validation report** in the chat

## Guidelines

- **Evidence-based**: Every status must have supporting evidence
- **Non-destructive**: Only read and verify, never modify code
- **Comprehensive**: Check all items, don't skip any
- **Actionable**: Issues must include clear recommendations
- **Objective**: Report actual state, not expected state
