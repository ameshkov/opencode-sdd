# Issue Validation Report: [ISSUE TITLE]

- **Validated**: [DATE]
- **Model**: [MODEL_NAME MODEL_VERSION THINKING_EFFORT]
- **Issue**: `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`
- **Plan**: `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
- **Overall Status**: [Complete / Incomplete / Blocked / Revised]

## Summary

| Category | Pass | Partial | Fail | Total |
| --- | --- | --- | --- | --- |
| Tasks | X | X | X | X |
| Acceptance Criteria | X | X | X | X |
| Entities | X | X | X | X |
| Contracts | X | X | X | X |
| Guidelines | X | X | X | X |

## Task Status

- [x] **Task 1**: [Description] - PASS
- [ ] **Task 2**: [Description] - FAIL: [reason]

## Acceptance Criteria Status

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Given..When..Then | MET | [File/test reference] |
| 2 | Given..When..Then | NOT MET | [What's missing] |

## Entity Status

| Entity | Fields | Relationships | Validation | Status |
| --- | --- | --- | --- | --- |
| [Name] | OK | OK | OK | PASS |

## Contract Status

| Endpoint | Method | Status | Notes |
| --- | --- | --- | --- |
| /api/resource | POST | PASS | |

## Guidelines Compliance

| Guideline | Status | Notes |
| --- | --- | --- |
| [Description] | COMPLIANT | |

## Issues Found

1. **[Issue Title]**
   - Location: [File/component]
   - Description: [What's wrong]
   - Impact: [How it affects the feature]
   - Recommendation: [How to fix]
   - Resolved: [Filled by `prd-implement-issue` when the revised
     implementation addresses this issue — note how. Omit while a
     validation is in progress.]

## Recommendations

- [Action items for completing implementation]
