---
description: Break a PRD into independently-grabbable vertical-slice issues (provided by opencode-sdd)
---

# Break PRD into issues

Break a Product Requirements Document into independently-grabbable issues
using vertical slices (tracer bullets). Each issue is a thin slice that cuts
through all integration layers end-to-end.

Constraints or preferences for the breakdown (may be empty): $ARGUMENTS

## Input

`$ARGUMENTS` is the input. Extract the following from it:

- **CONSTRAINTS** (optional, default: `no additional constraints`):
  Constraints or preferences for the breakdown (e.g., "keep it under 10
  issues", "focus on the API first"). Defaults to no additional
  constraints.
- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored. Defaults to `.sdd/.current/`. If not
  specified, use `.sdd/.current/`.

## Prerequisites

Check for the existence of `SPECS_DIR/prd.md`. If it does not exist,
**STOP immediately** and show this error:

**ERROR: PRD not found at `SPECS_DIR/prd.md`.**

**Run `prd-write [your feature description]` first to create a PRD.**

## Steps

### Phase 1: Load Context

1. **Read the PRD**
   - Read `SPECS_DIR/prd.md`
   - Extract:
     - Problem statement and solution
     - All user stories with acceptance scenarios
     - Key entities and their relationships
     - Module design
     - Implementation and testing decisions
     - Success criteria

2. **Read project guidelines**
   - Read `AGENTS.md` if it exists
   - Read `DEVELOPMENT.md` if it exists
   - These inform how issues should be scoped

3. **Explore the codebase**
   If not already familiar with the codebase, explore to understand:

   - Modules and files that will be affected
   - Existing patterns and conventions
   - Integration points

### Phase 2: Draft Vertical Slices

1. **Break the PRD into tracer-bullet issues**
   Each issue is a thin vertical slice that cuts through ALL integration
   layers end-to-end — schema, logic, API, UI, and tests — not a
   horizontal slice of a single layer.

   Slices are classified by type:

   - **AFK** (Away From Keyboard): Can be implemented and merged without
     human interaction
   - **HITL** (Human In The Loop): Requires a human decision or review at
     some point — for example, an architectural decision, a design
     review, or approval of a schema migration

   Prefer AFK over HITL wherever possible.

   Slice design rules:

   - Each slice delivers a narrow but complete path through every
     relevant layer
   - A completed slice is demoable or independently verifiable
   - Prefer many thin slices over few thick ones
   - Slices that cannot be verified on their own are too coarse
   - Flag any slice that addresses more than 2–3 user stories or would
     likely take more than half a day — it should be split

2. **Determine dependency order**
   - Identify which issues block other issues
   - Order issues so blockers come first
   - Minimize the dependency chain depth

### Phase 3: User Review

1. **Present the proposed breakdown**
   For each slice show:

   - **Title**: Short descriptive name
   - **Type**: HITL / AFK
   - **Blocked by**: Which other slices must complete first
   - **User stories covered**: Which numbered user stories from the PRD
     this addresses

2. **Ask the user**:
   - Does the granularity feel right? (too coarse / too fine)
   - Are the dependency relationships correct?
   - Should any slices be merged or split further?
   - Are all HITL slices correctly identified?

3. **Iterate until the user approves the breakdown**

### Phase 4: Write Issues

1. **Create the issues directory**
   - Create `SPECS_DIR/issues/` if it doesn't exist

2. **Write each issue to its own directory**
   For each approved issue:

   - Derive the ISSUE_ID as `{NUMBER}-{TYPE}` where NUMBER is the
     sequential issue number and TYPE is the slice type (e.g., `1-AFK`,
     `2-HITL`, `3-AFK`)
   - Create `SPECS_DIR/issues/{ISSUE_ID}/issue.md`
   - Use the issue template below
   - Replace all placeholders with concrete details
   - Cross-reference other issues by their ISSUE_ID in the "Blocked by"
     field

3. **Review the issues**
   - Verify every user story from the PRD is covered by at least one
     issue
   - Check that cross-references are consistent (no dangling references)
   - Confirm dependency order is correct (no circular dependencies)

## Issue Template

````markdown
# Issue: [TITLE]

**Issue ID**: [ISSUE_ID]
**Type**: [AFK / HITL]
**Status**: Draft
**Blocked by**: [ISSUE_ID, ISSUE_ID / None — can start immediately]

## Parent PRD

`SPECS_DIR/prd.md`

## What to Build

<!--
  A concise description of this vertical slice. Describe the
  end-to-end behaviour, not layer-by-layer implementation steps.
  Reference sections of the PRD rather than duplicating content.
-->

[Description of the vertical slice]

## How to Verify

<!--
  Exactly how a developer (or the AI implementing this) confirms
  the slice is complete.
-->

- **Manual**: [Step-by-step instructions to demo it]
- **Automated**: [What the test asserts]

## Acceptance Criteria

1. **Given** [initial state], **When** [action],
   **Then** [expected outcome]
2. **Given** [initial state], **When** [action],
   **Then** [expected outcome]

## User Stories Addressed

- User Story [N]: [Title from PRD]
- User Story [N]: [Title from PRD]
````

## Guidelines

- **Vertical slices only**: Each issue must cut through all layers, not
  just one
- **AFK preferred**: Minimize HITL issues where possible
- **Thin over thick**: Many small issues beat few large ones
- **Dependency order**: Blockers come first
- **Cross-reference**: Issues reference each other by ISSUE_ID
- **Complete coverage**: Every PRD user story must map to at least one
  issue
- **No duplication**: Reference the PRD instead of copying content
