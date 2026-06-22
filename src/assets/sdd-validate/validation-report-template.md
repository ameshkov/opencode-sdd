# Validation Report: [FEATURE NAME]

- **Validated**: [DATE]
- **Model**: [MODEL_NAME MODEL_VERSION THINKING_EFFORT]
- **Spec**: `SPECS_DIR/spec.md`
- **Plan**: `SPECS_DIR/plan.md`

## Summary

| Category | Pass | Partial | Fail | Total |
| -------- | ---- | ------- | ---- | ----- |
| Tasks | X | X | X | X |
| Requirements | X | X | X | X |
| Entities | X | X | X | X |
| Contracts | X | X | X | X |
| Guidelines | X | X | X | X |
| Success Criteria | X | X | X | X |

**Overall Status**: [COMPLETE / INCOMPLETE / BLOCKED]

## Task Status

### Phase 1: [Phase Name]

- [x] **Task 1.1**: [Status] - [Notes]
- [ ] **Task 1.2**: [Status] - [Notes]

### Phase 2: [Phase Name]

- [x] **Task 2.1**: [Status] - [Notes]

## Requirement Status

| ID | Requirement | Status | Evidence |
| -- | ----------- | ------ | -------- |
| FR-001 | [Description] | IMPLEMENTED | [File/test reference] |
| FR-002 | [Description] | PARTIAL | [What's missing] |

## Entity Status

| Entity | Fields | Relationships | Validation | Status |
| ------ | ------- | --------------- | ------------ | -------- |
| [Name] | OK | OK | OK | PASS |

## Contract Status

| Endpoint | Method | Status | Notes |
| -------- | ------ | ------ | ----- |
| /api/resource | POST | PASS | |
| /api/resource/:id | GET | FAIL | Missing error handling |

## Guidelines Compliance

| Guideline | Status | Notes |
| --------- | ------ | ----- |
| [Guideline description] | COMPLIANT | |
| [Guideline description] | NON-COMPLIANT | [What violates it] |

## Success Criteria Status

| ID | Criterion | Status | Evidence |
| -- | --------- | ------ | -------- |
| SC-001 | [Description] | MET | [How verified] |
| SC-002 | [Description] | CANNOT VERIFY | [Why] |

## Issues Found

1. **[Issue Title]**
   - Location: [File/component]
   - Description: [What's wrong]
   - Impact: [How it affects the feature]
   - Recommendation: [How to fix]

## Recommendations

- [Action items for completing implementation]
- [Suggestions for improving coverage]
