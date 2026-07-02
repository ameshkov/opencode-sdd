# Plan Review Report: [ISSUE TITLE]

- **Reviewed**: [DATE]
- **Model**: [MODEL_NAME MODEL_VERSION THINKING_EFFORT]
- **Issue**: `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`
- **Plan**: `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
- **Verdict**: [Approved | Rejected | Revised]
- **Review attempt**: [1 on first review; increment on each re-review]

## Per-Dimension Results

| Dimension | Result | Findings |
| --- | --- | --- |
| Correctness | pass or fail | X |
| Security | pass or fail | X |
| Performance | pass or fail | X |
| Maintainability | pass or fail | X |
| Architecture | pass or fail | X |
| Operational | pass or fail | X |

The plan is **Approved** only when all six dimensions pass.
Any `fail` makes the verdict **Rejected**.

## Consolidated Findings

Ordered by severity (high → medium → low), then dimension, then target.
Empty when the plan is Approved.
On re-review this list is updated in place — prior findings and their history
are preserved.

1. **[severity]** [dimension] — [Concrete description of the issue]
   - Target: [plan.md section or Task N]
   - Impact: [Why this should be fixed before implementation]
   - Recommendation: [How to fix]
   - Status: Open | Resolved | Dismissed
   - Resolved:
     [Set by `prd-issue-to-plan` when the revised plan addresses this finding — note how, e.g. “Task 3 now validates input”. Omit while a review is in progress. This is the *expectation* the reviewer confirms on re-review.]

## Dismissed Findings

Findings the reviewer dismissed as invalid (false positive, misreading, or
already handled) or out-of-scope (pre-existing code the plan does not touch,
another issue’s scope).
None count against the verdict.

1. **[severity]** [dimension] — [Concrete description of the dismissed finding]
   - Target: [plan.md section or Task N]
   - Reason: invalid: … | out-of-scope: …

## Notes

- Review analysis performed by the built-in `explore` subagent via the “task”
  tool (one delegation per dimension).
- Findings are deduplicated across dimensions before being listed above.
- On re-review, this report is updated in place: prior findings and their
  history are preserved, confirmed-resolved findings keep `**Status**: Resolved`
  and stay inline, new findings are appended as `**Status**: Open`, and
  dismissed findings move to the `## Dismissed Findings` section above.
