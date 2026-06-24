---
description: Produce a spec from a problem description (provided by opencode-sdd)
---

# Produce a spec

Produce an analysis document for bug fixes and small tasks that don't
require full feature specifications. Combine problem analysis, codebase
research, and solution design into a single output file.

Brief description of the bug or small change: $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **PROBLEM_DESCRIPTION** (required): Brief description of the problem or
  change.

  > **STOP — required input.** If `$ARGUMENTS` is empty or does not contain
  > a problem/change description, you MUST stop execution immediately and
  > ask the user to provide one. Do NOT proceed, do NOT guess, do NOT use a
  > placeholder. Wait for the user's response before continuing.

  After extracting PROBLEM_DESCRIPTION, **validate** that it is a genuine
  problem or change description. A valid description explains **what** is
  broken, **what** needs to change, or **what** small improvement is
  needed. Reject inputs that are:

    - Too vague to act on (e.g., "fix it", "something is wrong", "update
    code")
    - Not a problem/change description at all (e.g., a file path, a command,
    a question, a single word with no actionable meaning)
    - Ambiguous to the point where multiple completely different problems
    could be implied

  If the input fails validation, **STOP** and tell the user:

  > The provided input does not appear to be a problem or change
  > description. A valid description should explain **what** is broken,
  > **what** needs to change, or what **improvement** is needed.
  >
  > Example: "Login fails with a 500 error when the email contains a plus
  > sign"
  >
  > Please provide a clear problem or change description.

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored. Defaults to `.sdd/.current/`. If not
  specified, use `.sdd/.current/`.

## Guidelines

- **Stay focused**: This is for small, well-defined tasks
- **Research first**: Understand the problem before proposing solutions
- **Minimal scope**: If the task grows, recommend full SDD instead
- **Be specific**: List exact files, line ranges, and commands
- **Zero context assumed**: Write as if the engineer knows nothing about
  the codebase
- **TDD always**: Every behavior change starts with a failing test
- **DRY and YAGNI**: No speculative abstractions or duplicate logic
- **Document assumptions**: Note any assumptions made during analysis

## Steps

### Phase 1: Problem Analysis

1. **Extract the problem statement**
   - Identify what needs to be fixed or changed from PROBLEM_DESCRIPTION
   - Determine the type of task (bug fix, refactoring, configuration,
     etc.)
   - Note any specific files, functions, or components mentioned

2. **Read project context**
   - Read `README.md` to understand the product
   - Read `AGENTS.md` if it exists (coding standards and patterns)
   - Read `DEVELOPMENT.md` if it exists (development setup)
   - Understand the project structure and conventions

### Phase 2: Research

1. **Search the codebase**
   Delegate this codebase research to the `explore` subagent via the
   Task tool (`subagent_type: "explore"`). Give it a focused prompt
   covering the bullets below; it is read-only and returns findings you
   feed into the rest of this phase. Do not write files from this step.

   - Find the code related to the problem
   - Identify where the issue manifests or where changes are needed
   - Look for similar patterns or related functionality
   - Find implementation conventions to follow (coding style, test
     patterns, error handling approach)

2. **Analyze the findings**
   - For bugs: identify the root cause
   - For refactoring: find all usages and dependencies
   - For configuration: understand existing patterns

3. **Identify edge cases**
   - Boundary conditions related to the fix
   - Related failure modes the same fix should cover
   - Inputs or states that could break the proposed solution

### Phase 3: Clarify with the User

1. **Ask targeted questions**
   Using your research findings, ask the user about anything unclear in
   the problem description. Focus on questions that would change the
   solution approach:

   - What is the expected behaviour vs. actual behaviour?
   - Are there specific inputs, states, or conditions that trigger the
     problem?
   - What is the desired scope — minimal fix or broader improvement?
   - Are there related issues that should be addressed together?

2. **Resolve ambiguity before proceeding**
   - Do not accept vague answers — if the user says "it depends", ask
     what it depends on and resolve each case
   - Prioritize clarifications by impact:
     **scope > correctness > UX > technical details**
   - If a question has a clear default, propose it and confirm with the
     user
   - Only proceed to solution design when the problem and desired outcome
     are unambiguous

### Phase 4: Solution Design

1. **Propose the solution**
   - Describe the fix or change approach
   - Keep it minimal and focused
   - Note any alternative approaches considered

2. **Identify entities** (if the task adds new functionality or changes
   existing entities)
   - What entities are involved
   - Key attributes and relationships
   - Validation rules from requirements
   - Skip this step for minor bug fixes and refactorings

3. **List affected files**
   - Identify all files that need modification
   - Note any test files that need updates
   - Flag any configuration or documentation changes

4. **Define verification steps**
   - How to verify the fix works
   - What tests to run
   - Any manual verification needed

### Phase 5: Complexity Check

1. **Evaluate task complexity**
   - Check for indicators that suggest full SDD is needed:
     - Multiple unrelated components affected
     - New entities or data models required
     - API contract changes
     - New user-facing features
     - Cross-cutting concerns (auth, logging, etc.)

2. **Recommend workflow**
   - If complexity indicators found: recommend the PRD flow with
     `/prd-write` → issue planning → implementation instead
   - If task is straightforward: proceed with spec

### Phase 6: Write Implementation Plan

1. **Create the implementation plan file**
   - Write to `SPECS_DIR/spec.md`
   - Create the `SPECS_DIR/` directory if it doesn't exist
   - Follow the Implementation Plan Guidelines below to write a
     comprehensive implementation plan.

2. **Review the output**
   - Verify problem is clearly stated
   - Confirm file structure is mapped before tasks
   - Check that every task is a single action (2–5 minutes)
   - Ensure TDD flow: write failing test → verify failure → implement →
     verify pass
   - Confirm the plan is DRY, YAGNI

### Phase 7: Self-Review

After writing the complete plan, look at the spec with fresh eyes and check
the plan against it.

1. **Spec coverage**: Skim each section/requirement in the spec. Can you
   point to a task that implements it? List any gaps.

2. **Placeholder scan**: Search your plan for red flags — any of the
   patterns from [No Placeholders](#no-placeholders). Fix them.

3. **Type consistency**: Do the types, method signatures, and property
   names you used in later tasks match what you defined in earlier tasks? A
   function called `clearLayers()` in Task 3 but `clearFullLayers()` in
   Task 7 is a bug.

## Implementation Plan Guidelines

Write a comprehensive plan assuming the engineer has zero context for the
codebase. Document everything they need to know: which files to touch for
each task, code examples, testing commands, docs they might need to check,
how to verify each step.

### File Structure

Before defining tasks, map out which files will be created or modified and
what each one is responsible for. This is where decomposition decisions get
locked in.

Design units with clear boundaries and well-defined interfaces. Each file
should have one clear responsibility.

- Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility,
  not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses
  large files, don't unilaterally restructure — but if a file you're
  modifying has grown unwieldy, including a split in the plan is
  reasonable.

This structure informs the task decomposition. Each task should produce
self-contained changes that make sense independently.

### Bite-Sized Task Granularity

Each step is one action (2–5 minutes):

- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step

### Task Structure

Use the following structure for each task in the plan. Read and follow the
task structure template:

@opencode-sdd-templates/sdd-spec/task-structure-template.md

#### No Placeholders

Every step must contain the actual content an engineer needs. These are
plan failures — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks
  out of order)
- Steps that describe what to do without showing how (code blocks required
  for code steps)
- References to types, functions, or methods not defined in any task

#### Remember

- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD

### Full Document Template

Read and follow the full document template:

@opencode-sdd-templates/sdd-spec/plan-template.md
