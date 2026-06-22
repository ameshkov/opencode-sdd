---
title: prd-write
description: Write a Product Requirements Document (PRD) from a feature idea
---

Turn a free-form feature description into a structured Product Requirements
Document through codebase exploration and relentless user interview.

Use this command instead of `sdd-quickspec` when the feature is large or
complex enough to require issue-level breakdown and phased implementation.

Feature description: $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **FEATURE_DESCRIPTION** (required): the feature description.

  > **STOP — required input.** If `$ARGUMENTS` is empty or does not contain
  > a feature description, you MUST stop execution immediately and ask the
  > user to provide one. Do NOT proceed, do NOT guess, do NOT use a
  > placeholder. Wait for the user's response before continuing.

  After extracting FEATURE_DESCRIPTION, **validate** that it is a genuine
  feature or capability description. A valid feature description explains
  **what** the system should do or **what capability** should be added or
  changed. Reject inputs that are:

    - Too vague to act on (e.g., "make it better", "fix stuff")
    - Not a feature description at all (e.g., a file path, a command, a
    question, a single word with no actionable meaning)
    - Ambiguous to the point where multiple completely different features
    could be implied

  If the input fails validation, **STOP** and tell the user:

  > The provided input does not appear to be a feature description. A
  > feature description should explain **what** the system should do or
  > what **capability** should be added/changed.
  >
  > Example: "Add a user registration flow with email verification"
  >
  > Please provide a clear feature description.

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored. Defaults to `.sdd/.current/`. If not
  specified, use `.sdd/.current/`.

## Steps

### Phase 1: Context Gathering

1. **Read the repository README**
   - Understand what the product does and its purpose
   - Identify the target audience
   - Note existing capabilities and concepts
   - This context informs how the new feature fits into the product

2. **Read project guidelines**
   - Read `AGENTS.md` if it exists (coding standards and patterns)
   - Read `DEVELOPMENT.md` if it exists (development setup)
   - These inform constraints and conventions

3. **Explore the codebase**
   Before interviewing the user, explore the repo to verify their
   assertions and understand the current state. Look for:

   - Modules and files that will be affected by this change
   - Existing patterns, conventions, and abstractions to follow or
     build on
   - Anything that contradicts or complicates the user's description

### Phase 2: User Interview

1. **Interview the user about every aspect of the feature**
   Walk down each branch of the design tree, resolving dependencies
   between decisions one by one. Do not move to the next branch until
   the current one is resolved. Do not accept vague answers — if the
   user says "it depends", ask what it depends on and resolve each case.

   Cover at minimum:

   - Every actor who interacts with the feature and what they need
   - Every failure mode and what the correct behaviour is
   - Every edge case that the user stories imply
   - Every integration with existing modules or external systems
   - Any decisions that would be difficult or expensive to reverse
   - Security and privacy considerations

2. **Resolve ambiguity relentlessly**
   - Prioritize clarifications by impact:
     **scope > security/privacy > UX > technical details**
   - Only stop asking when every branch has an unambiguous answer
   - If a question has a clear industry-standard default, propose it and
     confirm with the user

### Phase 3: Design

1. **Define user stories**
   - Order stories by importance (P1, P2, P3, etc.)
   - Each story must be **independently testable**
   - Use Given/When/Then format for acceptance scenarios
   - Be exhaustive — include stories for error states, edge cases, and
     secondary actors

2. **Identify key entities**
   For each entity involved in the feature:

   - What it represents and its key attributes
   - How it relates to other entities
   - Validation rules and constraints
   - State transitions (if applicable)

3. **Sketch module design**
   Identify the major modules that will be built or modified. Actively
   look for opportunities to extract deep modules — modules that
   encapsulate significant functionality behind a simple, stable,
   testable interface. For each module, note:

   - What it is responsible for
   - Its public interface (inputs, outputs, failure modes)
   - Whether tests should be written for it
   - Which parts of its interface are likely to change

### Phase 4: Write PRD

1. **Create the PRD file**
   - Write to `SPECS_DIR/prd.md`
   - Create the `SPECS_DIR/` directory if it doesn't exist
   - Use the PRD template below
   - Replace all placeholders with concrete details
   - Preserve section order and headings

2. **Review the PRD**
   - Verify all mandatory sections are filled
   - Check that user stories are exhaustive and independently testable
   - Ensure acceptance scenarios cover error states and edge cases
   - Confirm module design aligns with user stories
   - Check that open questions have owners and resolution paths

## PRD Template

Read and follow the PRD template:

@opencode-sdd-templates/prd-write/prd-template.md

## Guidelines

- **Technology-agnostic**: Focus on what, not how
- **Exhaustive user stories**: Cover every actor, every error state,
  every edge case
- **Relentless interview**: Do not accept vague answers — resolve every
  branch
- **Deep modules**: Prefer fewer modules with simple interfaces over
  many shallow ones
- **Preserve context**: Reference how the feature fits into the existing
  product
- **No implementation details**: No file paths or code snippets in the
  PRD — these become outdated quickly
