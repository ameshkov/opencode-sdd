# PRD: [FEATURE NAME]

- **Created**: [DATE]
- **Status**: Draft
- **Model**: [MODEL_NAME MODEL_VERSION THINKING_EFFORT]
- **Input**: [FEATURE_DESCRIPTION provided by the user]

## Problem Statement

<!--
  The problem the user is facing, from the user's perspective.
  Not a technical description — describe the gap between what
  exists and what is needed.
-->

[Problem description]

## Solution

<!--
  The solution to the problem, from the user's perspective.
  Not an implementation plan — describe what will be true when the
  feature is complete.
-->

[Solution description]

## Assumptions

<!--
  Document any assumptions made when details were not specified.
  These inform reviewers what defaults were chosen and why.
-->

## User Stories

<!--
  User stories are PRIORITIZED journeys ordered by importance.
  Each story MUST be INDEPENDENTLY TESTABLE.
  Include stories for error states, edge cases, and secondary
  actors.
-->

### User Story 1 - [Brief Title] (Priority: P1)

As a `[actor]`, I want `[feature]`, so that `[benefit]`.

**Why this priority**: [Explain the value]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action],
   **Then** [expected outcome]
2. **Given** [initial state], **When** [action],
   **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

As a `[actor]`, I want `[feature]`, so that `[benefit]`.

**Why this priority**: [Explain the value]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action],
   **Then** [expected outcome]

---

[Add more user stories as needed]

## Key Entities

<!--
  Describe entities at a conceptual level.
  Include attributes, relationships, validation rules, and
  state transitions.
-->

### [Entity Name]

- **Attributes**: [key attributes with types]
- **Relationships**: [how it relates to other entities]
- **Validation**: [rules from requirements]
- **States**: [if applicable: state1 → state2 → state3]

## Module Design

<!--
  For each module that will be built or modified.
  Focus on deep modules with simple, stable interfaces.
-->

### [Module Name]

- **Responsibility**: [the single thing it owns]
- **Interface**: [inputs, outputs, failure modes]
- **Tested**: yes / no

## Implementation Decisions

<!--
  Decisions made during the interview that constrain or shape
  the implementation. Do NOT include file paths or code
  snippets.
-->

## Testing Decisions

- What makes a good test for this feature
- Which modules will have tests written
- Prior art in the codebase — similar tests to use as reference

## Out of Scope

<!--
  Explicit list of things NOT addressed in this PRD.
  Be specific — vague out-of-scope items create ambiguity later.
-->

- [Item 1]
- [Item 2]

## Open Questions

<!--
  Unresolved questions that could not be answered during the
  interview. Each must have an owner and a suggested resolution
  path.
-->

| Question | Owner | Resolution Path |
| --- | --- | --- |
| [Question 1] | [Owner] | [How to resolve] |

## Success Criteria

### Measurable Outcomes

- **SC-001**: [Quantitative metric]
- **SC-002**: [Performance metric]
- **SC-003**: [Quality metric]
