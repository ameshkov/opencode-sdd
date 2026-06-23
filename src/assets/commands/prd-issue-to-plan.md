---
description: Generate a structured implementation plan for a single PRD issue
---

# Generate implementation plan

Generate a structured implementation plan for a single PRD issue. The plan
includes technical context, research findings, entity definitions, API
contracts, and actionable tasks — scoped to one vertical slice.

Issue ID (e.g., 1-AFK): $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **ISSUE_ID** (required): The issue identifier (e.g., `1-AFK`). This
  corresponds to the directory name under `SPECS_DIR/issues/`.

  > **STOP — required input.** If `$ARGUMENTS` is empty or does not contain
  > an issue ID, you MUST stop execution immediately and ask the user to
  > provide one. Do NOT proceed, do NOT guess, do NOT use a placeholder.
  > Wait for the user's response before continuing.

- **CONSTRAINTS** (optional, default: `no additional constraints`):
  Constraints or preferences for the plan. Defaults to no additional
  constraints.
- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored. Defaults to `.sdd/.current/`. If not
  specified, use `.sdd/.current/`.

## Prerequisites

Check for the existence of the following files:

1. `SPECS_DIR/prd.md` — the parent PRD
2. `SPECS_DIR/issues/{ISSUE_ID}/issue.md` — the issue to plan

If the PRD is missing:

**ERROR: PRD not found at `SPECS_DIR/prd.md`. Run `prd-write` first to
create a PRD.**

If the issue file is missing:

**ERROR: Issue not found at `SPECS_DIR/issues/{ISSUE_ID}/issue.md`. Run
`prd-to-issues` first to create issues, or check the ISSUE_ID.**

If `SPECS_DIR/issues/{ISSUE_ID}/plan.md` already exists, warn the user:

> **WARNING**: A plan already exists for issue `{ISSUE_ID}`. Continuing
> will overwrite the existing plan. Do you want to proceed?

Wait for confirmation before continuing.

## Steps

### Phase 1: Load Context

1. **Read the parent PRD**
   - Read `SPECS_DIR/prd.md`
   - Extract the overall feature context, entities, module design, and
     implementation decisions
   - This provides the big picture for the issue

2. **Read the issue**
   - Read `SPECS_DIR/issues/{ISSUE_ID}/issue.md`
   - Extract:
     - What to build (the vertical slice description)
     - Acceptance criteria
     - How to verify
     - Dependencies (blocked by)

3. **Check dependency status**
   For each issue listed in the "Blocked by" field:

   - Read `SPECS_DIR/issues/{DEP_ISSUE_ID}/issue.md`
   - Check the Status field
   - If any dependency has Status "Draft" (not yet planned), warn the
     user:

   > **WARNING**: Issue `{ISSUE_ID}` is blocked by `{DEP_ISSUE_ID}`
   > which has not been planned yet. The plan may need adjustment once
   > blocking issues are planned. Do you want to proceed?

4. **Read project guidelines**
   - Read `AGENTS.md` if it exists (coding standards and patterns)
   - Read `DEVELOPMENT.md` if it exists (development setup)
   - Read `README.md` to understand the product

5. **Process user input** (if provided)
   - Read CONSTRAINTS for technology preferences or clarifications
   - Use constraints to resolve any ambiguities

### Phase 2: Research

1. **Explore the codebase**
   Focus on the parts of the codebase touched by this issue:

   - Files and modules that will be created or modified
   - Existing patterns to follow (naming, error handling, tests)
   - Any interfaces or contracts this issue must respect

2. **Research unknowns**
   For each unclear technical aspect:

   - Search the codebase for related patterns
   - Document findings with specifics

3. **Fill technical context**
   Determine from the codebase:

   - **Language/Version**: Programming language and version
   - **Primary Dependencies**: Key frameworks and libraries
   - **Storage**: Database or persistence mechanism (if applicable)
   - **Testing**: Test framework in use
   - **Target Platform**: Deployment target

### Phase 3: Entity Extraction

Skip this phase if the issue does not involve data entities.

1. **Extract entities relevant to this issue**
   For each entity:

   - **Name**: Entity identifier
   - **Fields**: Key attributes with types
   - **Relationships**: How it relates to other entities
   - **Validation rules**: Constraints from requirements
   - **State transitions**: Lifecycle states (if applicable)

2. **Map to existing entities**
   - Check if entities already exist in the codebase
   - Identify modifications needed
   - Note new entities to be created

### Phase 4: API Contracts (if applicable)

Skip this phase if the issue does not require API endpoints.

1. **Generate contracts from the issue's scope**
   For each user action that requires an API within this slice:

   - Define the endpoint (method, path, parameters)
   - Specify request/response schemas
   - Document error responses

2. **Output contract files**
   - Create `SPECS_DIR/issues/{ISSUE_ID}/contracts/` if needed
   - Write OpenAPI or GraphQL schema files

### Phase 5: Task Breakdown

1. **Analyze current structure**
   - Review the existing directory layout
   - Identify where new code should be placed
   - Follow existing patterns and conventions

2. **Plan structural changes**
   - List new directories and files to create
   - List modifications to existing files
   - Note responsibilities of each file

3. **Generate implementation tasks**
   Break the issue into discrete, testable tasks:

   - Each task is a single action (2–5 minutes)
   - Order tasks by dependency (prerequisites first)
   - Follow TDD flow: write failing test → verify failure → implement →
     verify pass
   - Include verification criteria for each task

### Phase 6: Write Plan

1. **Create the implementation plan**
   - Write to `SPECS_DIR/issues/{ISSUE_ID}/plan.md`
   - Use the plan template below
   - Replace all placeholders with concrete details

2. **Create contract files** (if applicable)
   - Write to `SPECS_DIR/issues/{ISSUE_ID}/contracts/`

3. **Update issue status**
   - Change the Status field in
     `SPECS_DIR/issues/{ISSUE_ID}/issue.md` from "Draft" to "Planned"

4. **Review the output**
   - Verify all sections are complete
   - Check that every task is a single action (2–5 minutes)
   - Ensure TDD flow is followed
   - Confirm the plan is DRY, YAGNI

### Phase 7: Self-Review

After writing the complete plan, check it against the issue.

1. **Issue coverage**: Skim the acceptance criteria in the issue. Can you
   point to a task that implements each criterion? List any gaps.

2. **Placeholder scan**: Search the plan for "TBD", "TODO", "implement
   later", "fill in details", "similar to Task N", or steps that describe
   what to do without showing how. Fix them.

3. **Type consistency**: Do the types, method signatures, and property
   names used in later tasks match earlier tasks?

## Plan Template

Read and follow the plan template:

@opencode-sdd-templates/prd-issue-to-plan/plan-template.md

## Guidelines

- **Be specific**: List exact files, line ranges, and commands
- **Zero context assumed**: Write as if the engineer knows nothing about
  the codebase
- **TDD always**: Every behavior change starts with a failing test
- **DRY and YAGNI**: No speculative abstractions or duplicate logic
- **Dependency order**: Tasks must be ordered so prerequisites come first
- **Existing patterns**: Follow conventions already established
- **Scoped to the issue**: Do not plan work outside the issue's vertical
  slice
- **No placeholders**: Every step must contain actual content — never
  "TBD", "TODO", or "similar to Task N"
