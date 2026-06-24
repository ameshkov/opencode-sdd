---
description: Validate an implemented spec and produce a report (provided by opencode-sdd)
---

# Validate a spec implementation

Verify that a specification has been fully implemented according to its
tasks and acceptance criteria.

Specs directory path or empty for default (`.sdd/.current/`): $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored.

## Prerequisites

Check for the specification file in `{SPECS_DIR}/`:

1. `{SPECS_DIR}/spec.md` - The specification with implementation tasks

If the file is missing:

**ERROR (if no spec found)**: Required file not found. Ensure
`{SPECS_DIR}/spec.md` exists. Run `sdd-spec` first.

## Steps

### Phase 1: Load Documentation

1. **Read the specification**
   - Read `{SPECS_DIR}/spec.md`
   - Extract:
     - Problem statement and root cause analysis
     - Affected files list
     - Proposed solution
     - All tasks with their verification criteria
     - Verification checklist
     - Acceptance scenarios

2. **Read any contract files**
   - Check `{SPECS_DIR}/contracts/` directory
   - Load OpenAPI or GraphQL schemas if present

3. **Read project guidelines**
   - Read `AGENTS.md` if it exists
   - Extract Code Guidelines and Contribution Instructions
   - These define coding standards the implementation must follow

4. **Read the prior validation (when re-validating)** — If
   `{SPECS_DIR}/validation.md` already exists, this is a re-validation of
   a revised implementation. Read its `Overall Status` and the issues
   recorded under `## Issues Found` (including any `Resolved:` notes the
   revision filled in). Carry each prior issue into the phases below and
   specifically verify the revised implementation resolves it; an
   unresolved prior issue must be reported again. If no prior validation
   exists, skip this step.

### Phase 2: Task Verification

For each task in the specification:

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

### Phase 3: Verification Checklist

For each item in the "Verification" section of the spec:

1. **Execute verification step**
   - Run commands, check files, or perform manual verification
   - Note the outcome

2. **Record verification status**
   - **PASS**: Verification step succeeded
   - **FAIL**: Verification step failed
   - **SKIP**: Cannot verify (note reason)

### Phase 4: Affected Files Verification

For each file listed in the "Affected Files" or "File Structure" section:

1. **Check file exists**
   - Verify the file is present in the codebase

2. **Verify changes were made**
   - Check that the file was modified as described
   - Look for the specific changes mentioned in the solution

3. **Record file status**
   - **MODIFIED**: File was changed as expected
   - **UNCHANGED**: File exists but wasn't modified
   - **MISSING**: File doesn't exist

### Phase 5: Contract Verification (if applicable)

Skip if no contracts exist in `{SPECS_DIR}/contracts/`.

1. **Verify API endpoints**
   - Check each endpoint exists
   - Verify request/response schemas match contracts
   - Check error responses are implemented

2. **Run contract tests**
   - If contract tests exist, execute them
   - Note any failures

### Phase 5: Guidelines Verification

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

### Phase 6: Final Verification

For each item in the "Final Verification" section of the spec:

1. **Execute final checks**
   - Run the commands specified in the Final Verification checklist
   - Note pass/fail for each

2. **Record status**
   - **PASS**: Check passed
   - **FAIL**: Check failed

### Phase 7: Generate Validation Report

1. **Write the validation report**
   - Write to `{SPECS_DIR}/validation.md`
   - Use the validation report template below
   - Replace all placeholders with concrete details
   - If overall status is Complete, also update spec status:
      change status from "Implemented" to "Validated" in
      `{SPECS_DIR}/spec.md`

## Finalize Specs Directory

**Applies only when overall status is Complete.**

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

## Validation Report Template

Read and follow the validation report template:

@opencode-sdd-templates/sdd-validate/validation-report-template.md

## Output

1. **Write the validation report** to `{SPECS_DIR}/validation.md`
2. **Display the validation report** in the chat

## Guidelines

- **Evidence-based**: Every status must have supporting evidence
- **Non-destructive**: Only read and verify, never modify code
- **Comprehensive**: Check all items, don't skip any
- **Actionable**: Issues must include clear recommendations
- **Objective**: Report actual state, not expected state
