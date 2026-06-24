# Plan Review Report: [ISSUE TITLE]

- **Reviewed**: [DATE]
- **Model**: [MODEL_NAME MODEL_VERSION THINKING_EFFORT]
- **Issue**: `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`
- **Plan**: `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
- **Verdict**: [Approved | Rejected | Revised]

## Per-Dimension Results

| Dimension | Result | Findings |
| --- | --- | --- |
| Correctness | pass or fail | X |
| Security | pass or fail | X |
| Performance | pass or fail | X |
| Maintainability | pass or fail | X |
| Architecture | pass or fail | X |
| Operational | pass or fail | X |

The plan is **Approved** only when all six dimensions pass. Any `fail`
makes the verdict **Rejected**.

## Consolidated Findings

Ordered by severity (high → medium → low), then dimension, then target.
Empty when the plan is Approved.

1. **[severity]** [dimension] — [Concrete description of the issue]
    - Target: [plan.md section or Task N]
    - Impact: [Why this should be fixed before implementation]
    - Recommendation: [How to fix]
    - Resolved: [Filled by `prd-issue-to-plan` when the revised plan
      addresses this finding — note how, e.g. "Task 3 now validates
      input". Omit while a review is in progress.]

## Notes

- Review analysis performed by the built-in `explore` subagent via the
  task tool (one dispatch per dimension).
- Findings are deduplicated across dimensions before being listed above.
- This file overwrites any previous review for the issue.
