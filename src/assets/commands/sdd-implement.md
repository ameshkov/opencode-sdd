---
description: Execute the tasks in an existing spec following TDD
---

# Implement from a spec

Implement a change by executing the tasks defined in the specification
`spec.md` following the TDD flow.

Task scope or empty to implement all tasks: $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **TASK_SCOPE** (optional, default: `all tasks`): Task selection or scope
  instructions (e.g., "Task 1.1 only", "Phase 1"). Defaults to all tasks in
  order. If not specified, use `all tasks`.
- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored. Defaults to `.sdd/.current/`. If not
  specified, use `.sdd/.current/`.

## Prerequisites

Check for the existence of the required file:

1. `SPECS_DIR/spec.md` - The specification with implementation tasks

If the file is missing:

**ERROR: Required file not found. Ensure `SPECS_DIR/spec.md` exists.
Run `sdd-spec` first.**

## Steps

### Phase 1: Load Context

1. **Read the specification**
   - Read `SPECS_DIR/spec.md`
   - Extract all tasks with their:
     - Description and files (create, modify, test)
     - Steps with exact code and commands
     - Prerequisites
     - Verification criteria
   - Note the task execution order
   - Extract acceptance scenarios for verification

2. **Read project guidelines**
   - Read `AGENTS.md` if it exists (coding standards and patterns)
   - Read `DEVELOPMENT.md` if it exists (development setup)
   - These inform implementation style and conventions

3. **Load contracts** (if applicable)
   - Check `SPECS_DIR/contracts/` directory
   - Load API schemas to guide implementation

### Phase 2: Determine Scope from TASK_SCOPE

1. **Parse TASK_SCOPE**
   - Match TASK_SCOPE against supported patterns (see Input section)
   - Identify selected tasks, skipped tasks, and starting point
   - For resume requests, check `spec.md` for `[x]` markers to find the
     last completed task and begin from the next one

2. **Build task queue**
   - If TASK_SCOPE is empty: queue all tasks in plan order
   - If TASK_SCOPE selects tasks: queue only matching tasks
   - If TASK_SCOPE skips tasks: queue all except skipped ones
   - For combined patterns, apply filters in order: select → skip
   - Verify prerequisites are satisfied for every queued task
   - If a prerequisite task is not in the queue and not already completed,
     warn the user before proceeding

3. **Report scope**
   - Display TASK_SCOPE as interpreted
   - List tasks that will be implemented (with IDs and descriptions)
   - List any skipped tasks and reasons
   - If TASK_SCOPE is ambiguous, ask the user to clarify before proceeding

### Phase 3: Execute Tasks

For each task in the queue:

1. **Announce task**
   - Display task ID and description
   - List files to create, modify, and test
   - List prerequisites and their status

2. **Execute task steps**
   Each task in the plan contains numbered steps. Execute them in order,
   following the TDD flow:

   - **Write the failing test**: Copy the exact test code from the plan
     into the test file
   - **Run the test to verify it fails**: Execute the specified test
     command and confirm the expected failure
   - **Write minimal implementation**: Copy the exact implementation code
     from the plan into the source file
   - **Run the test to verify it passes**: Execute the test command and
     confirm the test passes
   - If a step's code needs adjustment to work with the actual codebase
     state, make minimal changes and document why

3. **Verify the task**
   - Execute the verification criteria from the plan
   - Run relevant tests
   - Check that acceptance scenarios pass

4. **Report task status**
   - **DONE**: Task completed and verified
   - **BLOCKED**: Cannot proceed (explain why)
   - **NEEDS INPUT**: Requires user decision

5. **Update spec progress**
   - Mark completed tasks in the `spec.md` file with `[x]`
   - Mark completed steps within each task with `[x]`
   - Add implementation notes if helpful

### Phase 4: Integration Check

After completing all queued tasks:

1. **Run project verification**
   - Execute build command (if applicable)
   - Run linter and formatter
   - Execute test suite

2. **Check requirement coverage**
   - For each functional requirement in the spec
   - Verify implementation addresses it
   - Note any gaps

3. **Report completion status**
   - List completed tasks
   - List remaining tasks (those outside TASK_SCOPE or blocked)
   - Note issues encountered
   - If TASK_SCOPE was a partial selection, suggest the next TASK_SCOPE
     value to continue (e.g., "Continue from Task 2.1")

4. **Update spec status**
   - If all tasks completed successfully:
     - Change status from "Draft" to "Implemented" in `SPECS_DIR/spec.md`
     - Add `**Implemented by**: [MODEL_NAME MODEL_VERSION THINKING_EFFORT]`
       to the spec header metadata
     - Add implementation notes if helpful

## Task Execution Guidelines

### Code Quality

- **Follow the plan**: Use the exact code from the plan steps; only adjust
  when the actual codebase state requires it
- **Follow existing patterns**: Match the style of surrounding code
- **Minimal changes**: Implement only what the task requires
- **No premature optimization**: Focus on correctness first
- **DRY and YAGNI**: No speculative abstractions or duplicate logic

### Testing

- **TDD flow**: Write failing test → verify failure → implement → verify
  pass. Follow this order strictly.
- **Cover acceptance scenarios**: Each scenario should have a test
- **Test edge cases**: Include boundary conditions from the spec

### Error Handling

- **Task blocked**: Stop and report the blocker clearly
- **Plan divergence**: If the plan's code doesn't work as-is, make minimal
  adjustments and document the deviation
- **Test failure**: Fix the issue before proceeding
- **Build failure**: Resolve before moving to next task

### Progress Tracking

- **One task at a time**: Complete and verify before moving on
- **Update spec file**: Mark tasks and steps as complete with `[x]`
- **Note deviations**: Document any changes from the plan

## Output

After implementation:

1. **Summary of completed work**
   - Tasks completed
   - Files created/modified
   - Tests added

2. **Remaining work** (if any)
   - Tasks not yet implemented (inside and outside TASK_SCOPE)
   - Known issues or blockers
   - Suggested TASK_SCOPE for the next invocation to continue

3. **Next steps**
   - Suggest running `sdd-validate` to verify completeness
   - Note any manual verification needed

## Guidelines

- **Follow plan steps exactly**: Each task has numbered steps with exact
  code — execute them in order
- **TDD always**: Every behavior change starts with a failing test
- **Incremental progress**: Complete tasks one at a time
- **Verify continuously**: Don't accumulate unverified changes
- **Respect prerequisites**: Don't skip task dependencies
- **Stay in scope**: Implement what the plan specifies, no more
- **DRY and YAGNI**: No speculative abstractions or duplicate logic
- **Document blockers**: If stuck, explain clearly and stop
- **Follow project conventions**: Adhere to `AGENTS.md` guidelines
