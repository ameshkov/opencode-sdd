---
description: Review a PRD issue's plan across six dimensions (provided by opencode-sdd)
---
# Review an implementation plan

Review the specified implementation plan across six dimensions: Correctness,
Security, Performance, Maintainability, Architecture, and Operational.

## Input

User input: $ARGUMENTS

Extract the following from the user input:

- **ISSUE_ID** (required): The issue identifier (e.g., `1-AFK`). This
  corresponds to the directory name under `{SPECS_DIR}/issues/`.

  > **STOP — required input.** If the user input is empty or does not contain an
  > issue ID, you MUST stop execution immediately and ask the user to provide
  > one. Do NOT proceed, do not guess, do not use a placeholder.
  > Wait for the user’s response before continuing.

- **SPECS_DIR** (optional, default: `.sdd/.current/`): Directory where
  specification files are stored.

## Prerequisites

Check for the existence of the following files:

1. `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md` — the issue definition
2. `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md` — the implementation plan

If the issue file is missing:

**ERROR: Issue not found at `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`. Check the
{ISSUE_ID}.**

If the plan is missing:

**ERROR: Plan not found at `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`. Run
`prd-issue-to-plan {ISSUE_ID}` first.**

## Steps

### Phase 1: Load Context

1. **Read the plan** — `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`; extract tasks,
   entities, contracts, file structure, and verification criteria.
2. **Read the issue** — `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`; extract
   acceptance criteria and “How to Verify”.
3. **Read the parent PRD** — `{SPECS_DIR}/prd.md`; extract module design,
   entities, and implementation decisions for context.
   If it does not exist, continue without it (the issue and plan are
   sufficient).
4. **Read project guidelines** — `AGENTS.md` (Code Guidelines).
5. **Load any contracts** — files under
   `{SPECS_DIR}/issues/{ISSUE_ID}/contracts/` if present.
6. **Read the prior review (when re-reviewing)** — If
   `{SPECS_DIR}/issues/{ISSUE_ID}/review.md` already exists, this is a re-review
   of a revised plan. Read its `Verdict`, its `**Review attempt**` counter, and
   the consolidated findings — for each finding, read its `**Status**` line
   (`Open`, `Resolved`, or `Dismissed`) and any `Resolved:` note the revision
   filled in. Feed each prior finding to the matching dimension reviewer in Phase
   2 so it specifically verifies the revised plan resolves it; an unresolved
   prior finding must be reported again.
   If no prior review exists, skip this step.

### Phase 2: Delegate the Review to a Plan-Reviewer Subagent

Use the “task” tool to delegate to a read-only plan-reviewer subagent **once per
dimension** — six delegations total.
Run them **in parallel** if the runtime supports it; otherwise run them
sequentially. You are the primary agent and own all writes; each delegated task
only reads and **returns** its result.
**Agent selection — prefer the designated plan-reviewer subagent, fall back to
the `explore` subagent.** When the runtime has a designated plan-reviewer
subagent registered, delegate to it; this lets a dedicated review model review
the plan independently of the exploration model.
When no plan-reviewer subagent is available, fall back to the `explore`
subagent. Refer to the agent by its role, not a hardcoded name: both roles are
read-only codebase researchers that accept a focused prompt and return findings,
so the per-dimension prompt is identical whichever is delegated.
Absence of the designated plan-reviewer subagent is not an error — the explore
fallback is always a valid choice.

Each delegated task receives:

- The full text of `plan.md`
- The issue’s acceptance criteria and “How to Verify”
- The relevant PRD module design and entity context from Phase 1
- The applicable `AGENTS.md` Code Guidelines

Each delegated task must additionally **cross-check the plan against the actual
codebase** — open the files the plan names, verify the patterns and types it
relies on exist as described, and flag any mismatch.

Each delegated task returns a single object.
`result: "pass"` when it reports **zero** findings; otherwise `result: "fail"`:

```json
{
  "result": "pass",
  "findings": []
}
```

When there are findings:

```json
{
  "result": "fail",
  "findings": [
    {
      "severity": "high",
      "description": "Concrete description of the issue.",
      "target": "plan.md Task 3 / Entities section"
    }
  ]
}
```

Delegate to one task per dimension, using the selected agent, with the prompt
below (append the plan text, the issue’s acceptance criteria, the relevant PRD
context, and the applicable `AGENTS.md` guidelines to each prompt before
delegating):

#### Correctness & Logic

```text
You are the Correctness & Logic reviewer. Verify the plan is logically
sound and complete. Check: every acceptance criterion is covered by at
least one task (traceability); task ordering respects data and control
dependencies; edge cases and error states are handled; types and function
signatures are consistent across tasks; there are no logic gaps,
contradictions, or unreachable steps. Cross-check the plan's claims
against the actual codebase (file paths, existing types, function
signatures) and flag any mismatch. Flag any task ambiguous enough to be
implemented incorrectly. Omit trivial nitpicks — a clean plan should
genuinely pass. Return { result, findings }.
```

#### Security

```text
You are the Security reviewer. Verify the plan introduces no security
regressions. Check: secrets and credentials are never stored or logged in
plaintext; input validation and output encoding are present; authentication
and authorization checks are applied where required; injection risks (SQL,
command, XSS) are addressed; least privilege and minimal data exposure are
enforced; new dependencies are vetted. Cross-check against the actual
codebase. Omit trivial nitpicks. Return { result, findings }.
```

#### Performance

```text
You are the Performance reviewer. Verify the plan avoids obvious
performance problems. Check: queries and data access are efficient and use
indexes; large data sets are paginated or streamed; no unnecessary or
redundant work inside hot paths; caching is applied where beneficial;
resource limits (memory, connections, timeouts, batch sizes) are set. Omit
micro-optimizations. Return { result, findings }.
```

#### Maintainability

```text
You are the Maintainability reviewer. Verify the plan stays maintainable.
Check: it follows existing codebase patterns and conventions; it respects
DRY and YAGNI; each new unit has a single responsibility; naming is clear
and consistent; the result is testable and the plan names tests where
appropriate. Cross-check against the actual codebase conventions. Flag
unnecessary complexity or divergence from conventions. Omit trivial
nitpicks. Return { result, findings }.
```

#### Architecture

```text
You are the Architecture reviewer. Verify the plan aligns with the
intended architecture. Check: it matches the PRD's module design and
layering; dependencies point in the correct direction (no layer reaching
upward); interface contracts are defined and respected; cohesion is high
and coupling is low; changes are backward compatible or a migration is
planned. Cross-check the plan's module/layer claims against the actual
codebase. Flag violations of the stated architecture. Omit trivial
nitpicks. Return { result, findings }.
```

#### Operational

```text
You are the Operational reviewer. Verify the plan is operable. Check:
observability (logging, metrics, tracing) is present; configuration is
externalized and deployable; data migrations are safe and ordered; failure
modes are identified with fallback behavior; user-facing and operational
documentation is updated where needed. Omit trivial nitpicks. Return
{ result, findings }.
```

### Phase 3: Aggregate & Deduplicate

1. **Collect** each delegated task’s `{ result, findings }` into its dimension
   key (`correctness`, `security`, `performance`, `maintainability`,
   `architecture`, `operational`).
2. **Determine the verdict**:
   - `approved` iff ALL six dimensions are `pass`
   - `rejected` if ANY dimension is `fail`
3. **Deduplicate across dimensions** — two findings are duplicates when they
   share the same `target` and substantially overlap in `description`; merge
   into one, keeping the highest `severity`. Produce a single consolidated list
   ordered by severity (high → medium → low), then dimension, then target.
4. **Keep per-dimension attribution** in `review.md`; surface the consolidated,
   deduplicated list to the user.
   This consolidated list (plus prior findings’ statuses on a re-review) is the
   input to Phase 4, which validates each finding before anything is written.

### Phase 4: Validate Findings

You are the primary agent and own all judgments; you hold the Phase-1 context
the delegated reviewers did not.
Before writing anything, review every post-dedup finding against the codebase
and the issue’s plan, and assign each an outcome:

- **Validity** — re-open the files the finding names (in `plan.md`, the PRD, or
  the codebase) and confirm the claimed types/patterns/paths/signatures exist as
  described. **Dismiss** false positives, misreadings, stale assumptions, and
  problems the plan already handles.
  A finding is only valid if it describes a genuine defect in the plan as
  written.
- **Relevance** — **Dismiss** findings outside this issue’s plan / vertical
  slice: pre-existing code the plan does not touch, another issue’s scope, or
  concerns no plan could address.
  Relevance is judged against the issue’s acceptance criteria and the plan’s
  task list.
- **Re-review only** — for each prior finding the planner marked `Resolved:`
  (its `**Status**` is `Resolved`), verify the revised plan truly resolves it.
  If it does, confirm `**Status**: Resolved` and keep the finding inline (do not
  re-list it as Open).
  If it does not, overrule the planner’s claim: set `**Status**: Open` and keep
  it as an actionable finding.
- **Recompute results** — after filtering, recompute each dimension’s result and
  the verdict. A dimension whose only findings are `Dismissed` or `Resolved`
  becomes `pass`; a dimension that still has at least one `Open` finding stays
  `fail`. The verdict is `approved` iff all six dimensions are `pass`, else
  `rejected`.

Each finding’s outcome is one of:

- **Open** — kept inline as an actionable finding (set `**Status**: Open`).
- **Dismissed** — moved to the `## Dismissed Findings` section of `review.md`
  with a `- Reason:` line (`invalid: …` or `out-of-scope: …` plus a short
  explanation). Resolved prior findings that you confirm are also not re-listed
  here — they stay inline as `Resolved`.
- **Resolved** — only on re-review, for a prior finding the planner marked
  `Resolved:` that you confirm is truly resolved (set `**Status**: Resolved`;
  the finding stays inline).

`Dismissed` findings do not count against the verdict.
Only `Open` findings fail their dimension and route back to the planner.

### Phase 5: Write the Review & Update Status

1. **Write the review report**
   - On the **first review** (no prior `review.md`): write a fresh report to
     `{SPECS_DIR}/issues/{ISSUE_ID}/review.md` using the review report template,
     populating every field.
   - On a **re-review** (prior `review.md` exists, `**Review attempt**` ≥ `1`):
     **update the existing report in place** — do not overwrite it.
     Preserve prior findings and their history.
     Specifically:
     - Increment `**Review attempt**` (prior value plus one; a missing prior
       counter counts as `0`, so the first review sets `1`).
     - Keep every prior finding inline; set each finding’s `**Status**` line per
       Phase 4 (`Open`, `Resolved`, or `Dismissed`).
     - Move newly `Dismissed` findings into the `## Dismissed Findings` section
       (keep prior `Dismissed` entries and their reasons).
     - Append any **new** findings the reviewers raised this cycle as
       `**Status**: Open`.
     - Update the `Reviewer`/`Reviewed` date, `Model`, per-dimension results
       table, and `Verdict` to match the recomputed state.
   - Use the review report template below for the field layout in both cases.
   - Record the verdict, all six per-dimension results, and the consolidated,
     validated findings.

2. **Set the verdict-dependent Status fields**
   - `approved` ->
     - `**Status**: Approved` in `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
     - `**Status**: Approved` in `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`
   - `rejected` ->
     - `**Status**: Needs Revision` in `{SPECS_DIR}/issues/{ISSUE_ID}/plan.md`
     - `**Status**: Reviewing` in `{SPECS_DIR}/issues/{ISSUE_ID}/issue.md`

   If `plan.md` or `issue.md` has no `**Status**:` line, insert one near the top
   metadata block; otherwise replace the existing value.

3. **Verify consistency**
   - All six dimensions are recorded in `review.md` (never left blank)
   - The `plan.md` / `issue.md` `**Status**` matches the verdict

### Phase 6: Report & Route

- If **approved**: report that the plan passed all six dimensions and the run
  may proceed to `prd-implement-issue {ISSUE_ID}`.
- If **rejected**: display the consolidated, validated findings list (only
  `Open` findings; `Resolved` stay inline, `Dismissed` are listed separately)
  ordered by severity and route the user to `prd-issue-to-plan {ISSUE_ID}` to
  revise the plan, then re-run `prd-review-plan {ISSUE_ID}`.

## Review Report Template

Read and follow the review report template:

@opencode-sdd-templates/prd-review-plan/review-report-template.md

## Guidelines

- **Evidence-based**: Every finding cites a concrete `target` (plan section or
  task) and is cross-checked against the actual codebase.
- **Scoped to the plan**: Review the plan, not an implementation that does not
  exist yet. Focus on whether the plan itself is correct, secure, performant,
  maintainable, well-architected, and operationally sound.
- **Reviewers are read-only**: Never ask the delegated plan-reviewer (or the
  explore fallback) to write files.
  It returns findings; this command writes `review.md` and updates Status.
- **All six dimensions must complete**: Never leave a dimension blank in
  `review.md`.
- **Deduplicate before routing**: Merge duplicate findings across dimensions
  before presenting them.
- **Validate before writing**: No finding reaches `review.md` as actionable
  without a Phase-4 validity and relevance check.
  False positives and out-of-scope items go to the `## Dismissed Findings`
  section with a `- Reason:` line; only confirmed `Open` findings fail a
  dimension.
- **Non-destructive re-review**: On re-review, update `review.md` in place;
  never overwrite it. Prior findings, their `**Status**`, and the `Resolved:`
  note stay inline; confirmed-resolved findings keep `**Status**: Resolved`; new
  findings are appended as `**Status**: Open`; dismissed findings list a
  `- Reason:` and live in the `## Dismissed Findings` section.
- **Keep `review.md` and Status fields consistent**: The verdict in `review.md`
  must match the `**Status**` on `issue.md` / `plan.md`.
- **Omit trivial nitpicks**: A clean plan can genuinely pass.
  Report only actionable findings that should be fixed before implementation.
