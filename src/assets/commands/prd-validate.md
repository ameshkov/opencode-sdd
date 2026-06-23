---
description: Validate the full PRD implementation across all issues
---

# Validate the entire PRD implementation

Verify that the entire PRD has been fully implemented by checking that all
issues are done and running a cross-cutting audit across the full feature.
Produces a comprehensive validation report.

Use this command after all individual issues have been implemented and
validated with `prd-validate-issue`.

Specs directory path or empty for default (`.sdd/.current/`): $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored. Defaults to `.sdd/.current/`. If not
  specified, use `.sdd/.current/`.

## Prerequisites

Check for the existence of `SPECS_DIR/prd.md`. If it does not exist,
**STOP immediately** and show this error:

**ERROR: PRD not found at `SPECS_DIR/prd.md`. Run `prd-write` first to
create a PRD.**

Check for the existence of `SPECS_DIR/issues/`. If the directory does not
exist or is empty, **STOP immediately** and show:

**ERROR: No issues found in `SPECS_DIR/issues/`. Run `prd-to-issues` first
to create issues from the PRD.**

## Steps

### Phase 1: Load Documentation

1. **Read the PRD**
   - Read `SPECS_DIR/prd.md`
   - Extract:
     - Problem statement and solution
     - All user stories with acceptance scenarios
     - Key entities
     - Module design
     - Success criteria

2. **Read all issues**
   - Scan `SPECS_DIR/issues/` for issue directories
   - For each issue directory, read `issue.md`
   - Extract the Status field from each issue

3. **Read project guidelines**
   - Read `AGENTS.md` if it exists
   - Extract Code Guidelines and Contribution Instructions

### Phase 2: Check Issue Completion

1. **Verify all issues are implemented**
   For each issue in `SPECS_DIR/issues/`:

   - Check the Status field in `issue.md`
   - Acceptable statuses: "Implemented" or "Validated"
   - Record the status

2. **Stop if issues are not complete**
   If any issue has Status "Draft", "Planned", or "In Progress":

   > **ERROR: Not all issues are implemented. The following issues are not
   > complete:**
   >
   > - `{ISSUE_ID}`: Status = {STATUS}
   > - `{ISSUE_ID}`: Status = {STATUS}
   >
   > Implement all issues first, then retry.

3. **Read individual validation reports** (if they exist)
   For each issue, check for
   `SPECS_DIR/issues/{ISSUE_ID}/validation.md` and note any outstanding
   issues from individual validations.

### Phase 3: Cross-Cutting Audit

1. **Identify the full scope**
   From the PRD and all issues, build a list of every file that was
   created or modified as part of this feature.

2. **Explore the implementation**
   Read all files in scope. For each module, understand:

   - What it is responsible for
   - What its public interface is
   - How it interacts with other modules in scope
   - How it interacts with the rest of the codebase

3. **Audit for systemic issues**
   Check for the following categories across the entire implementation:

   **Consistency**:

   - Do all modules follow the same naming conventions?
   - Are error types and error handling patterns consistent?
   - Are similar operations implemented the same way everywhere?
   - Are internal API contracts consistent — do callers and
     implementations agree on types and failure modes?

   **Security**:

   - Is user input validated and sanitised at every entry point?
   - Are authentication and authorisation checks applied consistently?
   - Is sensitive data handled correctly and never logged?
   - Are there injection risks at any layer?

   **Logic**:

   - Are there race conditions or ordering assumptions that could fail
     under concurrent use?
   - Are all failure modes handled?
   - Are there off-by-one errors or incorrect boundary conditions?
   - Does the implementation match the acceptance criteria in every
     issue?

   **Best practices**:

   - Is there duplicated logic that should be extracted?
   - Are there deep modules implemented as shallow ones?
   - Are tests testing external behaviour or implementation details?
   - Is there dead code introduced by this feature?

### Phase 4: User Story Coverage

1. **Trace user stories to implementation**
   For each user story in the PRD:

   - Find the issue(s) that cover it
   - Verify the acceptance scenarios are satisfied
   - Note any gaps

2. **Check success criteria**
   For each success criterion (SC-XXX) in the PRD:

   - Evaluate whether it can be measured with current implementation
   - What evidence supports meeting this criterion?

### Phase 5: Guidelines Verification

Skip if `AGENTS.md` does not exist.

For each Code Guideline in `AGENTS.md`:

1. **Check guideline compliance**
   - Identify which guidelines apply to all changed or created files
   - Verify the implementation follows each applicable guideline

2. **Record guideline status**
   - **COMPLIANT**: Implementation follows the guideline
   - **NON-COMPLIANT**: Implementation violates the guideline
   - **N/A**: Guideline does not apply

### Phase 6: Generate Validation Report

1. **Prioritize findings**
   Group findings by severity:

   - **Critical**: Security vulnerability, data loss risk, or logic error
     that will cause incorrect behaviour in production
   - **High**: Inconsistency or logic error that will cause problems
     under realistic conditions
   - **Medium**: Best practice violation or inconsistency that will cause
     maintenance problems
   - **Low**: Minor inconsistency or style issue with no functional
     impact

2. **Write the validation report**
   - Write to `SPECS_DIR/validation.md`
   - Use the validation report template below
   - Replace all placeholders with concrete details

3. **Update PRD status** (if overall status is COMPLETE)
   - Change Status in `SPECS_DIR/prd.md` from "Draft" to "Validated"

4. **Display the validation report** in the chat

## Finalize Specs Directory

**Only execute when overall status is COMPLETE.**

If `SPECS_DIR` path ends with `.current` (the temporary work directory):

1. **Derive feature directory name**
   - Extract the feature name from the PRD
   - Convert to a kebab-case short description (maximum 60 characters)
   - Format the new directory name as `yyyymmdd-SHORT_DESCRIPTION` where
     `dd`, `mm`, `yyyy` are the current day, month, and year
   - Example: `.sdd/.current` → `.sdd/20260323-add-user-authentication`

2. **Rename the directory**
   - Rename the `.current` directory to the derived name within the same
     parent directory

## Validation Report Template

Read and follow the validation report template:

@opencode-sdd-templates/prd-validate/validation-report-template.md

## Output

1. **Write the validation report** to `SPECS_DIR/validation.md`
2. **Display the validation report** in the chat
3. If complete, **rename** the specs directory

## Guidelines

- **Evidence-based**: Every status must have supporting evidence
- **Non-destructive**: Only read and verify, never modify code
- **Comprehensive**: Check all issues, all user stories, all cross-cutting
  concerns
- **Actionable**: Findings must include clear recommendations
- **Objective**: Report actual state, not expected state
- **Severity-driven**: Critical findings first, low findings last
